# Editor Architecture

In this guide I will try to explain how the editor is structured internally.

This guide is meant for people willing to improve the editor somehow (trhough plugins or editing the base code).

## Structure

### CORE

The CORE is the global class created once the website is loaded, is the one in charge of loading all the files.
It also handles some global properties (like user preferences and configuration).

### Modules

Modules are independent elements of the editor that provide some functionality.
Modules can interact with the interface, with the 3D canvas and process the user input.

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

## Libraries

Some functionalities of the editor come from different libraries:

- LiteGUI: for the interface
- Canvas2DtoWebGL: to render in the 3D area 2D content
- LiteFileServer: to access remote files

If you plan to improve the editor it will useful to give them a look.


