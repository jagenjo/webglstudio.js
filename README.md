<p align="center">
    <img src="https://raw.githubusercontent.com/jagenjo/webglstudio.js/master/press/images/logo.png" alt="WebGLStudio">
</p>

# WebGLStudio.js

WebGLStudio.js is an open-source, browser-based 3D graphics suite. You can edit scenes and materials, design effects and shaders, code behaviours, and share your work - all within a browser using standard web technologies.

Some important WebGLStudio.js features:

 * A full 3D graphics engine ([LiteScene.js](https://github.com/jagenjo/litescene.js)) that supports multiple lights, shadowmaps, realtime reflections, custom materials, postFX, skinning, animation, and much more.
 * An easily extended, component-based system for controlling the rendering pipeline and interaction event hooks 
 * An easy to use, what you see is what you get (WYSIWYG) editor that provides a single interface for all coding, graph compositing and timeline features.
 * A graph editor for controlling behaviours and post-processing effects.
 * Supports the [LiteFileSystem.js](https://github.com/jagenjo/litefilesystem.js), a virtual file system that allows drag-and-drop storage of resources on the web, with configurable quotas, users and shared folders.
 * Export and share your work by sending a single link.

For more information, visit http://webglstudio.org

![Interface](press/images/interface.jpg "Interface")

Features missing:
* Mesh editing, you cannot select faces and move them
* Support for FBX, it has some sort of support but not fully functional
* Physics


Installing
----------

To install WebGLStudio.js, copy the editor files to your server, then install [LiteFileSystem.js](https://github.com/jagenjo/litefilesystem.js) into a `fileserver/` folder within the `editor/` directory. 
LiteFileSystem is a library that handles remote file storage. For more information, see the `/INSTALL.md` file and the [LiteFileSystem.js](https://github.com/jagenjo/litefilesystem.js) documentation.

Feedback
--------

Send all feedback to javi.agenjo@gmail.com
