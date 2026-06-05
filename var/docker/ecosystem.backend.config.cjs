module.exports = {
  apps: [
    {
      name: 'nginx',
      script: 'nginx',
      args: "-g 'daemon off;'",
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      kill_timeout: 5000,
    },
    {
      name: 'backend',
      cwd: '/app/apps/backend',
      script: 'dist/apps/backend/src/main.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '2G',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
    {
      name: 'orchestrator',
      cwd: '/app/apps/orchestrator',
      script: 'dist/apps/orchestrator/src/main.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '3G',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
