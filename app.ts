import ev = require('dotenv');
import { Master } from './master';
import { Logger } from './logger';

ev.config(); // Initialize nodejs environment variable from .env file
process.chdir(__dirname); // Just to fix bugs on some file systems
Logger.initialize(true); // Change this according to dev | prod mode
Master.start(); // Start server and let the game begin
