# Plugins
You can create your own plugins for WebGLStudio, this way if you miss some functionality in the editor you can coded it easily.

The plugin can be loaded from the Edit -> Preferences -> Plugins menu.

Plugins are javascript files loaded once the application has been loaded, they can add new options to the menus, new buttons in the interface, new parsers, etc.

To code plugins you must understand a little bit how WebGLStudio is organized, check the WebGLStudio code structure guide.

You also need to use the LiteGUI library that allows you to create panels, widgets, contextual menus, etc.

## Example

```js
var MyPlugin = {
	name: "myplugin",

	init: function()
	{
		//in case it needs to load other JS files
		LiteGUI.requireScript(["..."], inner );

		function inner(v)
		{
			console.log("plugin loaded");
		}
	},

	deinit: function()
	{
		//called when the plugin has been removed
	}
};
```
