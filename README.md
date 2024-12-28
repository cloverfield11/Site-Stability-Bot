# Телеграм-бот для мониторинга сайтов

<img width="293" alt="Снимок экрана 2024-12-28 в 13 07 50" src="https://github.com/user-attachments/assets/462730ce-9613-41a3-a05b-631ce8a288ff" />


Этот репозиторий содержит исходный код Телеграм-бота на Node JS, который позволяет пользователям добавлять сайты для мониторинга, отслеживать изменения заголовков и статусов страниц, а также проверять сроки действия SSL-сертификатов. Бот также делает скриншоты страниц и уведомляет пользователей об изменениях.

## Функциональность

- **Добавление сайтов**: Пользователи могут добавить неограниченное количество сайтов для мониторинга.
- **Мониторинг изменений**: Бот отслеживает изменения заголовков и статусов страниц.
- **Проверка SSL-сертификатов**: Бот проверяет сроки действия SSL-сертификатов.
- **Скриншоты страниц**: Бот делает скриншот страницы при ее добавлении и прикрепляет к карточке сайта.
- **Уведомления**: Бот уведомляет пользователей об изменениях на сайтах.

## Установка

1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/cloverfield11/Site-Stability-Bot
   cd Site-Stability-Bot
   ```

2. Установите зависимости:
   ```bash
   npm install
   ```

3. Добавьте токен телеграм бота в example.env, а затем уберите "example" из названия:
   ```
   TELEGRAM_BOT_TOKEN=ваш_токен
   ```

4. Запустите бота:
   ```bash
   node bot.js
   ```

## Использование

1. Откройте Telegram и найдите вашего бота.
2. Начните взаимодействие с ботом, отправив команду `/start`.
3. Следуйте инструкциям бота для добавления сайтов, просмотра информации о сайтах и получения уведомлений.

## Лицензия

Этот проект лицензирован под лицензией MIT. Подробности смотрите в файле [LICENSE](LICENSE).

## Контакты

Если у вас есть вопросы или предложения, пожалуйста, свяжитесь с автором проекта.
