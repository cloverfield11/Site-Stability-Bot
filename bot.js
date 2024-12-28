require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const cron = require('node-cron');
const puppeteer = require('puppeteer');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const dataFilePath = path.join(__dirname, 'userData.json');
const screenshotsDir = path.join(__dirname, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

function readData() {
    if (fs.existsSync(dataFilePath)) {
        return JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    }
    return {};
}

function writeData(data) {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
}

async function getPageTitle(url) {
    try {
        const response = await axios.get(url);
        const html = response.data;
        const $ = cheerio.load(html);
        const title = $('title').text().trim();
        return title || 'Заголовок не найден';
    } catch (error) {
        if (error.response && error.response.status) {
            return `Ошибка: ${error.response.status}`;
        }
        console.error('Ошибка при получении заголовка:', error);
        return 'Ошибка при получении заголовка';
    }
}

async function getResponseStatus(url) {
    try {
        const response = await axios.get(url);
        return response.status;
    } catch (error) {
        if (error.response && error.response.status) {
            return error.response.status;
        }
        console.error('Ошибка при получении статуса:', error);
        return 'Ошибка при получении статуса';
    }
}

async function getCertificateExpiry(url) {
    return new Promise((resolve, reject) => {
        if (url.startsWith('https')) {
            const host = url.replace(/^https?:\/\//, '').split(':')[0];
            const options = {
                host: host,
                port: 443,
                method: 'GET',
                rejectUnauthorized: false
            };

            const req = https.request(options, (res) => {
                const cert = res.socket.getPeerCertificate();
                if (cert && cert.valid_to) {
                    resolve(cert.valid_to);
                } else {
                    resolve('Сертификат не найден');
                }
            });

            req.on('error', (error) => {
                console.error('Ошибка при получении сертификата:', error);
                reject('Ошибка при получении сертификата');
            });

            req.end();
        } else {
            resolve('Сертификат не требуется');
        }
    });
}

async function takeScreenshot(url) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const screenshot = await page.screenshot();
    await browser.close();
    return screenshot;
}

async function saveScreenshot(url, screenshot) {
    const screenshotPath = path.join(screenshotsDir, `${url.replace(/[^a-zA-Z0-9]/g, '_')}.png`);
    fs.writeFileSync(screenshotPath, screenshot);
    return screenshotPath;
}

async function checkSites() {
    const userData = readData();
    for (const chatId in userData) {
        const sites = userData[chatId];
        for (const site of sites) {
            const newTitle = await getPageTitle(site.url);
            const newStatus = await getResponseStatus(site.url);
            let message = '';

            if (newTitle !== site.title && newStatus !== site.status) {
                message = `Сайт: ${site.url}\nЗаголовок изменен: ${newTitle}\nСтатус изменен: ${newStatus}`;
            } else if (newTitle !== site.title) {
                message = `Сайт: ${site.url}\nЗаголовок изменен: ${newTitle}`;
            } else if (newStatus !== site.status) {
                message = `Сайт: ${site.url}\nСтатус изменен: ${newStatus}`;
            }

            if (message) {
                const screenshot = await takeScreenshot(site.url);
                const screenshotPath = await saveScreenshot(site.url, screenshot);

                const options = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Ок', callback_data: `delete_message_${chatId}` }]
                        ]
                    }
                };

                bot.sendPhoto(chatId, screenshotPath, {
                    caption: message,
                    ...options
                }).then(sentMessage => {
                    lastMessageId[chatId] = sentMessage.message_id;
                }).catch(error => {
                    console.error('Ошибка при отправке сообщения:', error);
                });

                site.title = newTitle;
                site.status = newStatus;
                writeData(userData);
            }
        }
    }
}

cron.schedule('*/3 * * * *', checkSites);

let lastMessageId = {};
let userMessageId = {};

function deleteLastMessage(chatId) {
    if (lastMessageId[chatId]) {
        bot.deleteMessage(chatId, lastMessageId[chatId]).catch(error => {
            console.error('Ошибка при удалении сообщения:', error);
        });
    }
}

function deleteUserMessage(chatId) {
    if (userMessageId[chatId]) {
        bot.deleteMessage(chatId, userMessageId[chatId]).catch(error => {
            console.error('Ошибка при удалении сообщения пользователя:', error);
        });
    }
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    deleteLastMessage(chatId);
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Добавить сайт', callback_data: 'add_site' }],
                [{ text: 'Мои сайты', callback_data: 'my_sites' }],
                [{ text: 'Стереть все', callback_data: 'clear_all' }]
            ]
        }
    };
    bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', options).then(sentMessage => {
        lastMessageId[chatId] = sentMessage.message_id;
    }).catch(error => {
        console.error('Ошибка при отправке сообщения:', error);
    });
});

async function updateSiteData(chatId, siteUrl) {
    const userData = readData();
    const site = userData[chatId].find(site => site.url === siteUrl);
    if (site) {
        try {
            const title = await getPageTitle(siteUrl);
            const status = await getResponseStatus(siteUrl);
            let certExpiry = 'Сертификат не требуется';
            if (siteUrl.startsWith('https')) {
                certExpiry = await getCertificateExpiry(siteUrl);
            }
            const screenshot = await takeScreenshot(siteUrl);
            const screenshotPath = await saveScreenshot(siteUrl, screenshot);

            site.title = title;
            site.status = status;
            site.certExpiry = certExpiry;
            site.screenshotPath = screenshotPath;

            writeData(userData);

            const siteInfo = `URL: ${site.url}\nЗаголовок: ${site.title}\nСтатус: ${site.status}\nСрок действия сертификата: ${site.certExpiry}`;
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Удалить сайт', callback_data: `delete_${site.url}` }],
                        [{ text: 'Обновить все данные', callback_data: `update_site_${site.url}` }],
                        [{ text: 'Назад', callback_data: 'back' }]
                    ]
                }
            };
            bot.sendPhoto(chatId, screenshotPath, {
                caption: siteInfo,
                ...options
            }).then(sentMessage => {
                lastMessageId[chatId] = sentMessage.message_id;
            }).catch(error => {
                console.error('Ошибка при отправке сообщения:', error);
            });
        } catch (error) {
            bot.sendMessage(chatId, 'Произошла ошибка при обновлении данных сайта.').catch(error => {
                console.error('Ошибка при отправке сообщения:', error);
            });
        }
    }
}

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const userData = readData();

    if (data.startsWith('delete_message_')) {
        const messageId = callbackQuery.message.message_id;
        bot.deleteMessage(chatId, messageId).catch(error => {
            console.error('Ошибка при удалении сообщения:', error);
        });
    } else if (data === 'add_site') {
        deleteLastMessage(chatId);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отмена', callback_data: 'cancel_add_site' }]
                ]
            }
        };
        bot.sendMessage(chatId, 'Пожалуйста, введите адрес сайта:', options).then(sentMessage => {
            lastMessageId[chatId] = sentMessage.message_id;
        }).catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
        });
        bot.once('message', async (msg) => {
            userMessageId[chatId] = msg.message_id;
            const siteUrl = msg.text;
            const sites = userData[chatId] || [];
            const existingSite = sites.find(site => site.url === siteUrl);

            if (existingSite) {
                const options = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Отмена', callback_data: 'cancel_add_site' }]
                        ]
                    }
                };
                bot.sendMessage(chatId, 'Этот сайт уже добавлен.', options).then(sentMessage => {
                    lastMessageId[chatId] = sentMessage.message_id;
                }).catch(error => {
                    console.error('Ошибка при отправке сообщения:', error);
                });
                return;
            }

            try {
                const title = await getPageTitle(siteUrl);
                const status = await getResponseStatus(siteUrl);
                let certExpiry = 'Сертификат не требуется';
                if (siteUrl.startsWith('https')) {
                    certExpiry = await getCertificateExpiry(siteUrl);
                }
                const screenshot = await takeScreenshot(siteUrl);
                const screenshotPath = await saveScreenshot(siteUrl, screenshot);

                if (!userData[chatId]) {
                    userData[chatId] = [];
                }
                userData[chatId].push({
                    url: siteUrl,
                    title,
                    status,
                    certExpiry,
                    screenshotPath,
                });
                writeData(userData);
                deleteLastMessage(chatId);
                deleteUserMessage(chatId);
                const options = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Назад', callback_data: 'back' }]
                        ]
                    }
                };
                bot.sendPhoto(chatId, screenshotPath, {
                    caption: `Сайт ${siteUrl} добавлен!\nЗаголовок: ${title}\nСтатус: ${status}\nСрок действия сертификата: ${certExpiry}`,
                    ...options
                }).then(sentMessage => {
                    lastMessageId[chatId] = sentMessage.message_id;
                }).catch(error => {
                    console.error('Ошибка при отправке сообщения:', error);
                });
            } catch (error) {
                bot.sendMessage(chatId, 'Произошла ошибка при добавлении сайта.').catch(error => {
                    console.error('Ошибка при отправке сообщения:', error);
                });
            }
        });
    } else if (data === 'cancel_add_site') {
        deleteLastMessage(chatId);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Добавить сайт', callback_data: 'add_site' }],
                    [{ text: 'Мои сайты', callback_data: 'my_sites' }],
                    [{ text: 'Стереть все', callback_data: 'clear_all' }]
                ]
            }
        };
        bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', options).then(sentMessage => {
            lastMessageId[chatId] = sentMessage.message_id;
        }).catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
        });
    } else if (data === 'my_sites') {
        deleteLastMessage(chatId);
        const sites = userData[chatId] || [];
        if (sites.length > 0) {
            const siteButtons = sites.map(site => [{ text: site.url, callback_data: `site_${site.url}` }]);
            const options = {
                reply_markup: {
                    inline_keyboard: siteButtons
                }
            };
            bot.sendMessage(chatId, 'Выберите сайт:', options).then(sentMessage => {
                lastMessageId[chatId] = sentMessage.message_id;
            }).catch(error => {
                console.error('Ошибка при отправке сообщения:', error);
            });
        } else {
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Назад', callback_data: 'back' }]
                    ]
                }
            };
            bot.sendMessage(chatId, 'У вас пока нет сайтов.', options).then(sentMessage => {
                lastMessageId[chatId] = sentMessage.message_id;
            }).catch(error => {
                console.error('Ошибка при отправке сообщения:', error);
            });
        }
    } else if (data === 'clear_all') {
        deleteLastMessage(chatId);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подтвердить', callback_data: 'confirm_clear_all' }],
                    [{ text: 'Отмена', callback_data: 'cancel_clear_all' }]
                ]
            }
        };
        bot.sendMessage(chatId, 'Вы уверены, что хотите стереть все данные?', options).then(sentMessage => {
            lastMessageId[chatId] = sentMessage.message_id;
        }).catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
        });
    } else if (data === 'confirm_clear_all') {
        deleteLastMessage(chatId);
        delete userData[chatId];
        writeData(userData);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Назад', callback_data: 'back' }]
                ]
            }
        };
        bot.sendMessage(chatId, 'Все данные очищены.', options).then(sentMessage => {
            lastMessageId[chatId] = sentMessage.message_id;
        }).catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
        });
    } else if (data === 'cancel_clear_all') {
        deleteLastMessage(chatId);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Добавить сайт', callback_data: 'add_site' }],
                    [{ text: 'Мои сайты', callback_data: 'my_sites' }],
                    [{ text: 'Стереть все', callback_data: 'clear_all' }]
                ]
            }
        };
        bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', options).then(sentMessage => {
            lastMessageId[chatId] = sentMessage.message_id;
        }).catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
        });
    } else if (data.startsWith('site_')) {
        deleteLastMessage(chatId);
        const siteUrl = data.split('_')[1];
        const site = userData[chatId].find(site => site.url === siteUrl);
        if (site) {
            const siteInfo = `URL: ${site.url}\nЗаголовок: ${site.title}\nСтатус: ${site.status}\nСрок действия сертификата: ${site.certExpiry}`;
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Удалить сайт', callback_data: `delete_${site.url}` }],
                        [{ text: 'Обновить все данные', callback_data: `update_site_${site.url}` }],
                        [{ text: 'Назад', callback_data: 'back' }]
                    ]
                }
            };
            bot.sendPhoto(chatId, site.screenshotPath, {
                caption: siteInfo,
                ...options
            }).then(sentMessage => {
                lastMessageId[chatId] = sentMessage.message_id;
            }).catch(error => {
                console.error('Ошибка при отправке сообщения:', error);
            });
        }
    } else if (data.startsWith('delete_')) {
        deleteLastMessage(chatId);
        const siteUrl = data.split('_')[1];
        userData[chatId] = userData[chatId].filter(site => site.url !== siteUrl);
        writeData(userData);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Назад', callback_data: 'back' }]
                ]
            }
        };
        bot.sendMessage(chatId, `Сайт ${siteUrl} удален.`, options).then(sentMessage => {
            lastMessageId[chatId] = sentMessage.message_id;
        }).catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
        });
    } else if (data.startsWith('update_site_')) {
        deleteLastMessage(chatId);
        const siteUrl = data.split('_')[2];
        await updateSiteData(chatId, siteUrl);
    } else if (data === 'back') {
        deleteLastMessage(chatId);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Добавить сайт', callback_data: 'add_site' }],
                    [{ text: 'Мои сайты', callback_data: 'my_sites' }],
                    [{ text: 'Стереть все', callback_data: 'clear_all' }]
                ]
            }
        };
        bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', options).then(sentMessage => {
            lastMessageId[chatId] = sentMessage.message_id;
        }).catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
        });
    }
});

bot.on('polling_error', (error) => {
    console.log(error);
});