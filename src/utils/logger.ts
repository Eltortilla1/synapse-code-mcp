import pino from 'pino';

const level = (process.env['LOG_LEVEL'] ?? 'info') as pino.Level;

const opts: pino.LoggerOptions = {
  level,
  base: { pid: false },
};

if (process.env['NODE_ENV'] === 'development') {
  opts.transport = { target: 'pino-pretty', options: { colorize: true, destination: 2 } };
}

export const logger = pino(opts);
