// PM2: mantém o servidor rodando, reinicia se cair.
//   npm install -g pm2
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'chat',
      cwd: path.join(__dirname, '..', 'server'), // o .env é lido daqui
      script: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      max_restarts: 20,
      restart_delay: 3000,
    },
  ],
};
