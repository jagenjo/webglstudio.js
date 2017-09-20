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

## Creating panels

The first use of plugins is to create new panels that can be openend for special purposes.

Here is an example of how to create a simple dialog using LiteGUI:

```js
showDialog: function()
{
	var dialog = new LiteGUI.Dialog({title:"Editor", close: true, width: 300, height: 120, scroll: false, draggable: true});
	var widgets = new LiteGUI.Inspector();
	dialog.add(widgets);
	widgets.addButton("My button","Click", function(){ console.log("clicked"); });
	dialog.show();
	dialog.adjustSize();
}
```

For more info about LiteGUI check [the repository and guides for LiteGUI](https://github.com/jagenjo/litegui.js/tree/master).

## Creating components for LiteScene

You can create new components from the plugin. This components will only be available if the plugin is loaded so it is more a temporary way for developing components than a final solution. 

Check the [guide to create components](https://github.com/jagenjo/litescene.js/blob/master/guides/programming_components.md) to know more.

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
