import { Server } from './server';
import { Logger } from './logger';

process.chdir(__dirname); // Just to fix bugs on some file systems
Logger.initialize(true); // Change this according to dev | prod mode
Server.start(); // Start server and let the game begin
