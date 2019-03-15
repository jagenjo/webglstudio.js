# Install

First remember that to use WebGLStudio you need to install it in a server that has a http server installed to host websites.
Also you will need to have shell access to that server to execute some scripts.

## Requirements

You need to have installed an HTTP Server (Apache or nginx) with PHP support and MySQL.

## Download
You need to download two projects from github:
- LiteFileServer.js [ZIP](https://github.com/jagenjo/litefilesystem.js/archive/master.zip)
- WebGLstudio.js [ZIP](https://github.com/jagenjo/webglstudio.js/archive/master.zip)

## Unpack
Upload the files to your server and unpack them following the next steps:

- Unpack the webglstudio ```editor/``` folder in a folder inside a public folder in your server.
- Create a folder called ```fileserver/``` inside that folder
- Unpack the litefileserver inside the ```fileserver/``` folder created

## Install LiteFileServer

To install litefileserver follow this guide: [Guide to install LiteFileSystem](https://github.com/jagenjo/litefilesystem.js/blob/master/INSTALL.md)

Check that your installation works by entering to the ```fileserver/``` folder from your browser.

## Configure 

Now we need to configure WebGLStudio, edit the config.json to specify where is the fileserver located ( the ```fileserver/``` folder ) and where are the files ( the ```fileserver/files``` folder ).
By default they should have that name.

## Ready

If everything was done propertly you should be able to enter to the webglstudio in your server and see everything working.


