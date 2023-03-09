import { Master } from './master';
import { Logger } from './logger';

process.chdir(__dirname); // Just to fix bugs on some file systems
Logger.initialize(true); // Change this according to dev | prod mode
Master.start(); // Start server and let the game begin
