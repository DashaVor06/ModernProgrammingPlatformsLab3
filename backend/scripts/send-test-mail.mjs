/**
 * Проверка настройки почты: отправляет тестовое письмо со ссылкой сброса пароля.
 *
 * Запуск:  npm run mail:test -- your@email.com
 */
import { sendPasswordResetEmail, getMailTransportName } from '../src/utils/mailer.js';
import { config } from '../src/config/index.js';

const to = process.argv[2];

if (!to) {
  console.error('Использование: npm run mail:test -- ваш@email.com');
  process.exit(1);
}

const transport = getMailTransportName();
console.log('Транспорт :', transport);
if (transport === 'resend') {
  console.log('Resend key:', config.mail.resendApiKey ? 'задан' : 'НЕ задан');
} else if (transport === 'smtp') {
  console.log('SMTP host :', config.mail.host);
  console.log('SMTP user :', config.mail.user || '(нет)');
} else if (transport === 'ethereal') {
  console.log('SMTP не настроен — письмо уйдёт в тестовый ящик Ethereal (не на реальную почту).');
} else {
  console.log('Почта не настроена: задайте RESEND_API_KEY или SMTP_*.');
}
console.log('MAIL_FROM :', config.mail.from);
console.log('APP_URL   :', config.appUrl);
console.log('Получатель:', to);
console.log('Отправка...');

try {
  const res = await sendPasswordResetEmail(to, 'test-token-' + Date.now());
  console.log('\n✅ Письмо отправлено.');
  console.log('transport :', res.transport);
  console.log('messageId :', res.messageId);
  console.log('resetUrl  :', res.resetUrl);
  if (res.previewUrl) {
    console.log('previewUrl:', res.previewUrl);
    console.log('(Это Ethereal — письмо в тестовой песочнице, не в вашем ящике.)');
  } else {
    console.log('Письмо ушло через реальный транспорт — проверьте почту (и папку «Спам»).');
  }
} catch (e) {
  console.error('\n❌ Ошибка отправки:', e.message);
  process.exit(1);
}
