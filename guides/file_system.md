# File System

WebGLStudio allows to store files server side so all your changes can be persistent between sessions even if you login from different computers.

It also enables to share your creations between other users or reuse components/prefabs created by other users.

To achieve this the WebGLStudio uses the library [LiteFileSystem](https://github.com/jagenjo/litefilesystem.js).

## DriveModule

The Module in the system in charge of all the resources is called DriveModule.

Here is an example of how to save a resource in the system:

```js
var res = new LS.Resource();
res.filename = "guest/temp/foo.json";
res.data = JSON.stringify({ name: "javi" });

DriveModule.saveResource( res );
```
