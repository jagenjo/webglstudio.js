 /* This module allows to load external modules on the fly as plugins. */

var PluginsModule  = {
	name: "plugins",

	settings_panel: [ {name:"plugins", title:"Plugins", icon:null } ],
	plugins: [],

	preferences: {
		plugins: []
	},

	init: function()
	{
		if(	this.preferences.plugins && this.preferences.plugins.length )
		{
			var plugins = this.preferences.plugins;
			for(var i in plugins)
			{
				this.loadPlugin( plugins[i] );
			}
		}
	},

	onShowSettingsPanel: function(name,widgets)
	{
 		if(name != "plugins")
			return;

		var selected = null;
		var list = widgets.addList("Installed", this.plugins, { height: 380, callback: function(v){
			selected = v;
		}});

		widgets.addButtons("", ["Remove","Refresh"], function(v){
			if(!selected)
				return;

			if( v == "Remove" )
			{
				PluginsModule.removePlugin( selected );
				SettingsModule.updateDialogContent();
			}
			else if( v == "Refresh" )
			{
				var plugin = PluginsModule.removePlugin( selected );
				if(!plugin || !plugin.url)
					return;
				PluginsModule.loadPlugin( plugin.url, function(){ SettingsModule.updateDialogContent(); } );
				SettingsModule.updateDialogContent();
			}
		});

		widgets.addStringButton("Add Plugin URL","js/plugins/", { button:"+", callback_button: function(value) { 
			console.log("Loading: " + value);
			PluginsModule.loadPlugin( value, function(){
				SettingsModule.updateDialogContent();
				SettingsModule.changeSection("plugins");
			}, function(){
				LiteGUI.alert("Plugin cannot be loaded");
			});
		}});
	},

	loadPlugin: function( url, on_complete, on_error )
	{
		var last_module = null;
		if(CORE.Modules.length)
			last_module = CORE.Modules[ CORE.Modules.length - 1];

		LiteGUI.requireScript( url, inner_loaded, on_error );

		function inner_loaded()
		{
			var module = CORE.Modules[ CORE.Modules.length - 1 ];
			if( last_module != module )
			{
				//somethign loaded
				console.log( "Plugin loaded: " + module.name );
				PluginsModule.registerPlugin( module, url );
				if(on_complete)
					on_complete(true);
			}
			else
			{
				var placeholder_plugin = { name: LS.RM.getFilename(url) };
				PluginsModule.registerPlugin( placeholder_plugin, url );
				console.log("Plugin without module?");
				if(on_complete)
					on_complete(false);
			}
		}
	},

	registerPlugin: function( plugin, url )
	{
		plugin.url = url;
		this.plugins.push( plugin );
		if( this.preferences.plugins.indexOf( url ) == -1 )
			this.preferences.plugins.push( url );
		return plugin;
	},

	removePlugin: function( name_or_plugin )
	{
		var index = -1;
		var plugin = null;
		if(name_or_plugin.constructor === String)
		{
			for(var i = 0; i < this.plugins.length; ++i)
			{
				var item = this.plugins[i];
				if(item.name != name_or_plugin && item.url != name_or_plugin)
					continue;
				index = i;
				plugin = item;
				break;
			}
		}
		else
		{
			plugin = name_or_plugin;
			index = this.plugins.indexOf( plugin );
		}

		if(!plugin)
		{
			console.warn("Not found: ", name_or_plugin );
			return;
		}

		this.plugins.splice( index,1 );
		this.preferences.plugins.splice( index,1 );

		CORE.removeModule( plugin );
		return plugin;
	},

	reset: function()
	{
		this.plugins = [];
	}
}

CORE.registerModule( PluginsModule );