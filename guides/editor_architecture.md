# Editor Architecture

In this guide I will try to explain how the editor is structured internally.

This guide is meant for people willing to improve the editor somehow (through plugins or editing the base code).

## Structure

### Libraries

WebGLStudio relies in several libraries that were developed for this project. 

* **LiteGL**: is the library in charge of wrapping the WebGL driver
* **LiteScene**: is the engine used to handle the 3D scenes.
* **LiteGUI**: is the library used to build the interface
* **LiteGraph**: is the library used to create graphs
* **LiteFileSystem**: is the library in charge of storing files in the back-end

You do now need to understand all of them in depth, just to know what features bring to the editor in case you want to extend them.

### CORE

The ```CORE``` (core.js) is the global class created once the website is loaded, is the one in charge of loading the rest of the files.
It also handles some global properties (like user preferences and configuration).

Inside the CORE all the loaded modules are stored.

### Modules

Modules are independent elements of the editor that provide some functionality.
Modules can interact with the interface, with the 3D canvas and process the user input.
Almost every feature of the editor is stored in one Module, here is a list of the most important ones:
* **RenderModule**: in charge of rendering the 3D canvas.
* **DriveModule**: in charge of storing files.
* **EditorModule**: in charge of the elements that allow to edit the scene.
* **PluginModule**: to load plugins from the editor.
* **PreferencesModule**: To store user preferences about the editor.
* **SceneStorageModule**: in charge of loading/saving the scenes.
* **ToolsModule**: in charge of the canvas buttons to toggle/enable tools.
* **SelectionModule**: in charge of controling user selection of elements in the scene.
* **UndoModule**: in charge of history of changes.

### UI Widgets

The UI Widgets are classes that allow to access some properties of the system and edit them.

The important UI widgets are:

- InspectorWidget: to inspect any object of the system
- ResourcesPanelWidget: to choose any resource in the server or local
- CodingPad: to code
- SceneTree: to select any node of the current scene
- Timeline: to edit animations
- GraphWidget: to edit a graph

### Canvas Widgets

This widgets are meant to be rendered inside the 3D Canvas and are used to interact with the scene.

### Tools

Tools are in charge of giving ways to interact with the 3D content. Like moving objects in the scene, or selecting, or moving the camera.
They can intercept user input inside the canvas to perform actions.

The most important tools are:

- camera: to move the camera around
- select: to select elements by clicking
- move: to move nodes
- rotate: to rotate nodes
- scale: to scale nodes
- manipulate: to move in a friendly way
- parenting: to select node parent


