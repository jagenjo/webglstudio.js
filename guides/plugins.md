# Plugins
You can create your own plugins for WebGLStudio, this way if you miss some functionality in the editor you can coded it easily.

The plugin can be loaded from the Edit -> Preferences -> Plugins menu.

Plugins are javascript files loaded once the application has been loaded, they can add new options to the menus, new buttons in the interface, new parsers, etc.

To code plugins you must understand a little bit how WebGLStudio is organized, check the WebGLStudio code structure guide.

You also need to use the LiteGUI library that allows you to create panels, widgets, contextual menus, etc.

## Registering the Plugin

You must create a class that contains the next methods:

* ```init```: called once the plugin is loaded in memory, after the system is ready
* ```deinit```: called if the user decides to remove the plugin from memory

Also if your plugin requires to save information locally you can store them in the preferences property of the plugin.


## Example

```js
var MyPlugin = {
	name: "myplugin",
	
	preferences: {},

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

CORE.registerPlugin( MyPlugin );

```
