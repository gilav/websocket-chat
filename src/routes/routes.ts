import * as express from 'express';
import * as path from 'path';

export class Routes {
  private app: express.Application;

  constructor(app: express.Application) {
    this.app = app;
    this.setStaticDir();
  }

  private home(): void {
    this.app.get('/', (request, response) => {
      console.log(' get /: ' + __dirname + '/../views');
      response.sendFile('index.html', {
        // relative to Route.js at runtime ?
        root: __dirname + '/../views',
      });
    });

    this.app.get('/create', (request, response) => {
      console.log(' get /create: ' + __dirname + '/../views');

      // Generate unique id for the room
      var id = Math.round(Math.random() * 1000000);

      response.redirect('/chat/' + id);
    });

    this.app.get('/chat/:id', (request, response) => {
      console.log(' get /chat/:id: ' + __dirname + '/../views');
      console.log(' room id:' + request.params['id']);

      response.sendFile('chat.html', {
        // relative to Route.js at runtime ?
        root: __dirname + '/../views',
      });
    });
  }

  private setStaticDir(): void {
    // relative to server.js at runtime ?
    console.log(' set static: ' + path.join(__dirname, '../public'));
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  public getRoutes(): void {
    this.home();
  }
}
