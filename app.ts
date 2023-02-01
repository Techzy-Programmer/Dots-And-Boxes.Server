import { Server } from './server';
import { Logger } from './logger';
process.chdir(__dirname);
Logger.initialize(true);
Server.start();
