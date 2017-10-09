# Tools

To interact with the scene we resort to tools that transform our mouse inputs to actions.

Common tools are Move, Rotate, Scale, etc.

In case you want to create your own tool here is a simple guide.

# Create an object

The object that holds a tool can have the next properties:

- **name**: used to assign the tool
- **description**: shown when the mouse is over the button
-	**section**: sections are used to group buttons together
-	**icon**: url to the icon to show in the button
-	**keyShortcut**: optional, in case you want to show the icon in the button
- **enabled**: in case it must be drawn like enabled

And the next methods:

- **callback**: called when the user clicks the button
- **mousedown**, **mousemove**, **mouseup**, **mousewheel**: to catch mouse events
- **renderEditor**: to render helpers. Check the [LS.Draw guide to render](https://github.com/jagenjo/litescene.js/blob/master/guides/draw.md)

# Register the class

Tools must be registered to be available from the system.

```js
ToolsModule.registerTool( moveTool );
```
