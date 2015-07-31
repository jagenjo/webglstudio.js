/* This module allows to load external modules on the fly as plugins. */

var PluginsModule  = {
	settings_panel: [ {name:"plugins", title:"Plugins", icon:null } ],
	loaded_plugins: [],

	init: function()
	{
	},

	onShowSettingsPanel: function(name,widgets)
	{
 		if(name != "plugins") return;

		widgets.addList("Installed", this.loaded_plugins, { height: 400 } );
		widgets.addStringButton("Plugin URL","js/modules/", { callback_button: function(value) { 
			trace("Loading: " + value);
			PluginsModule.loadPlugin(value);
		}});
	},

	loadPlugin: function(url, on_complete )
	{
		var last_plugin = null;
		if(LiteGUI.modules.length)
			last_plugin = LiteGUI.modules[ LiteGUI.modules.length - 1];

		$.getScript(url, function(){
			trace("Running...");
			inner();
		}).fail( function(response) {
			if(response.status == 200)
			{
				try
				{
					eval(response.responseText);
					inner();
				}
				catch (err)
				{
					trace("Error parsing code");
					LiteGUI.alert("Problem, plugin has errors. Check log for more info.");
					trace(err);
				}
			}
			else if(response.status == 404)
			{
				trace("Error loading plugin");
				LiteGUI.alert("Problem, plugin not found.");
			}
			else
			{
				trace("Error loading plugin");
				LiteGUI.alert("Problem, plugin cannot be loaded. [Error: " + response.status + "]");
			}

			if(on_complete) on_complete(false);
		});

		function inner()
		{
			var loaded_plugin = LiteGUI.modules[ LiteGUI.modules.length - 1];
			if(loaded_plugin != last_plugin)
			{
				PluginsModule.loaded_plugins.push( { name: loaded_plugin.name || url , url: url });
				trace("Plugin loaded OK");
				AppSettings.updateDialogContent();
				AppSettings.changeSection("plugins");
				if(on_complete) on_complete(true);
			}
			else
			{
				trace("Error loading plugin");
				LiteGUI.alert("Plugin File loaded but it doesnt looks like a plugin");
				if(on_complete) on_complete(false);
			}
		}
	},
}

LiteGUI.registerModule( PluginsModule );