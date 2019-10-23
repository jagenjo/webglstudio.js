 /* This module allows to load external modules on the fly as plugins. */

var PluginsModule = {
	name: "plugins",

	official_addons_repository_url: "https://www.webglstudio.org/addons/", //for the scene
	official_plugins_repository_url: "https://www.webglstudio.org/plugins/", //for the editor

	//preferences_panel: [ { name:"plugins", title:"Plugins", icon:null } ],

	preferences: {
		addons: { repository_url: "", list: [] },
		plugins: { repository_url: "", list: [] } 
	},

	init: function()
	{
		var mainmenu = LiteGUI.menubar;
		mainmenu.add("Window/Plugins", { callback: function() { PluginsModule.showPluginsDialog(); }});

		this.loadPlugins();

		LiteGUI.addCSS("\
			.scripts_container { background-color: black; margin: 4px; padding: 4px; } \n\
			.scripts_container .subtitle { opacity: 0.5; font-size: 0.8em; display: block; margin-top: -10px; margin-bottom: -4px; } \n\
			.scripts_container .repository_script { background-color: #3e3a31; }\n\
			.scripts_container .repository_script:hover { background-color: #59513e; }\n\
			.scripts_container .repository_script.selected { background: linear-gradient(to right, #3e3a31,#9c8757) !important; }\n\
			.scripts_container .repository_script .title { color: #DDD; }\n\
			.scripts_container .user_script { background-color: #2d2d2d; }\n\
			.scripts_container .user_script:hover { background-color: #333; }\n\
			.scripts_container .user_script.selected { background: linear-gradient(to right, #333,#555) !important; }\n\
			.scripts_container .user_script.selected .title { color: #ddd; !important }\n\
		");
	},

	//called by core after loading the preferences from localStorage
	//restores preferences for plugins
	onPreferencesLoaded: function()
	{
		//legacy code
		if(	!this.preferences.plugins )
			this.preferences.plugins = { repository_url: "", list: [] };
		if(!this.preferences.plugins.list )
			this.preferences.plugins.list = [];

		var plugins = this.preferences.plugins.list;

		//assign preferences?
	},

	loadPlugins: function()
	{
		var plugins = this.preferences.plugins.list;
		for(var i = 0; i < plugins.length; ++i)
		{
			var plugin = plugins[i];
			if(!plugin.enabled)
				continue;
			this.loadPlugin( plugin.full_url );
		}
	},

	getPluginInfo: function(script_url)
	{
		var plugins = this.preferences.plugins.list;
		for(var i = 0; i < plugins.length; ++i)
		{
			var plugin = plugins[i];
			if(plugin.full_url == script_url)
				return plugin;
		}
		return null;
	},

	loadPlugin: function( url, on_complete, on_error )
	{
		//fetch plugin code
		LiteGUI.requireScript( url, inner_loaded, on_error );

		//once loaded
		function inner_loaded()
		{
			var plugin_info = PluginsModule.getPluginInfo( url );
			//somethign loaded
			console.log( "Plugin loaded: " + url );
			if(on_complete)
				on_complete(true);
		}
	},

	/*
	onNewPlugin: function( e )
	{
		//assign preferences
		var plugin = e.detail;
		for(var i in this.preferences.plugins)
		{
			var plugin_info = this.preferences.plugins[i];
			if( plugin_info.url != plugin.url )
				continue;
			
			if(plugin_info.preferences)
				plugin.preferences = plugin_info.preferences;
			break;
		}
	},

	registerPlugin: function( plugin, url )
	{
		plugin.url = url;
		this.plugins.push( plugin ); //register object

		//store in preferences
		var found = null;
		for(var i in this.preferences.plugins)
		{
			var plugin_info = this.preferences.plugins[i];
			if( plugin_info.url != url )
				continue;
			found = plugin_info;
			break;
		}

		if( !found )
			this.preferences.plugins.push( { name: plugin.name, url: url } );
		else
		{
			if( found.preferences )
				plugin.preferences = found.preferences;
		}
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
	*/

	reset: function()
	{
		//this.plugins = [];
	},

	showPluginsDialog: function( on_callback )
	{
		var options = {
			title: "Plugins",
			preferences: PluginsModule.preferences.plugins,
			official_url: PluginsModule.official_plugins_repository_url,
			on_is_included: function( url ) {
				var info = PluginsModule.getPluginInfo( url );
				return info && info.enabled;
			},
			on_include_in_list: function( url, plugin ) {
				var info = PluginsModule.getPluginInfo( url );
				if(!info)
					PluginsModule.preferences.plugins.list.push( plugin );
				else
					console.warn("already in the list");
			},
			on_remove_from_list: function( url, plugin ) {
				var info = PluginsModule.getPluginInfo( url );
				var index = PluginsModule.preferences.plugins.list.indexOf( info );
				if(index != -1)
					PluginsModule.preferences.plugins.list.splice( index, 1 );
			},
			on_toggle_script: function( url, item ) {
				var info = PluginsModule.getPluginInfo( url );
				if(!info)
				{
					PluginsModule.preferences.plugins.list.push(item);
					info = item;
				}

				if(!info.enabled)
				{
					info.enabled = true;
					PluginsModule.loadPlugin( url );
				}
				else
				{
					var index = PluginsModule.preferences.plugins.list.indexOf( info );
					if(index != -1)
						PluginsModule.preferences.plugins.list.splice( index, 1 );
					LiteGUI.alert("Plugin removed, you must reload the website to have effect.");
				}
			}
		};

		this.showExternalScriptsDialog( options, on_callback );
	},

	showAddonsDialog: function( on_callback )
	{
		var options = {
			title: "Addons Scripts",
			preferences: PluginsModule.preferences.addons,
			official_url: PluginsModule.official_addons_repository_url,
			on_include_in_list: function(url) {
				if( LS.GlobalScene.external_scripts.indexOf( url ) == -1 )
					LS.GlobalScene.external_scripts.push( url );
			},
			on_remove_from_list: function(url) {
				var index = LS.GlobalScene.external_scripts.indexOf( url );
				if(index != -1)
					LS.GlobalScene.external_scripts.splice( index, 1 );
			},
			on_is_included: function( url ) {
				return LS.GlobalScene.external_scripts.indexOf( url ) != -1;
			},
			on_toggle_script: function( url, item ) {
				var index = LS.GlobalScene.external_scripts.indexOf( url );
				if(index == -1) //not installed
				{
					LS.GlobalScene.external_scripts.push( url );
					LS.GlobalScene.loadScripts( null, on_callback );
					return true;
				}
				else //installed
				{
					LS.GlobalScene.external_scripts.splice( index, 1 );
					return false;
				}
			}
		};

		this.showExternalScriptsDialog( options, on_callback );
	},

	//** ADDONS ****************************************

	showExternalScriptsDialog: function( options, on_callback )
	{
		var dialog = new LiteGUI.Dialog( { title: options.title, close: true, width: 800, height: 480, scroll: false, draggable: true } );

		var area = new LiteGUI.Area({width:"100%",height:"100%"});
		area.split("horizontal",["50%",null]);
		dialog.add(area);

		var preferences = options.preferences;
		var official_url = options.official_url;
		var official_list = [];

		var repository_url = preferences.repository_url || official_url;

		var selected = null;

		var inspector_left = new LiteGUI.Inspector( { scroll: true, resizable: true, full: true } );
		area.getSection(0).add( inspector_left );

		var inspector_right = new LiteGUI.Inspector( { scroll: true, name_width: 100, resizable: true, full: true } );
		area.getSection(1).add( inspector_right );

		inspector_right.addInfo(null,"Here you can load scripts from external repositories. Remember that using non-verified scripts into your projects could compromise the security of the user, so only include scripts when you trust the origin. All scripts from the official repository are verified.");

		inspector_right.addTitle("Script Information");
		inspector_right.startContainer("",{ height: 270 });
		var title = inspector_right.addString("Title","" );
		var author = inspector_right.addString("Author","" );
		var version = inspector_right.addString("Version","" );
		var description = inspector_right.addTextarea("Description","",{height:160} );
		var script_url_widget = inspector_right.addString("Script URL","",{} );
		var script_repository_widget = inspector_right.addString("From repository","",{ disabled: true } );

		inspector_right.endContainer();

		//buttons: clear, update, include, test
		var include_button = inspector_right.addButtons(null,["Include","Remove","Clear","Store","View Code"],{ callback: function(v){

			if( v == "Store")
				inner_add_custom_script();
			else if( v == "Clear")
				inner_clear_form();

			if(!selected)
				return;
			if(v == "Include")
			{
				options.on_include_in_list( selected.full_url, selected );
			}
			else if(v == "Remove")
			{
				options.on_remove_from_list( selected.full_url, selected )
			}
			else if( v == "View Code")
				inner_view_code( selected.full_url );

			if(on_callback)
				on_callback();
			updateScriptsList();
		}});
		inspector_right.addSeparator();

		//left
		inspector_left.widgets_per_row = 2;
		var url_widget = inspector_left.addString("Repository", repository_url, { width: "calc( 100% - 30px )", callback: function(v){
			if(!v)
			{
				repository_url = official_url;
				url_widget.setValue( official_url );
				preferences.repository_url = "";
			}
			else if(repository_url != v)
				repository_url = v;
		}, callback_enter: function(){
			PluginsModule.fetchList( repository_url, inner_list );
		}});

		inspector_left.addButton(null, LiteGUI.special_codes.refresh,{ width: 30, callback: function(){
			PluginsModule.fetchList( repository_url, inner_list );
		}});
		inspector_left.widgets_per_row = 1;

		//list container
		inspector_left.addTitle("Available Scripts");
		var scripts_container = inspector_left.addContainer("scripts",{ height: 400, scrollable: true });
		scripts_container.className = "scripts_container";
		var list_filter = "";
		var searchbox = new LiteGUI.SearchBox("", { callback: function(v){
			list_filter = v.toLowerCase();
			updateScriptsList();
		}});
		scripts_container.appendChild( searchbox.root );

		var scripts_list = new LiteGUI.ComplexList({ height: "calc( 100% - 30px)" });
		scripts_list.onItemSelected = inner_select_item;
		scripts_list.onItemRemoved = inner_remove_item;
		scripts_list.onItemToggled = inner_toggle_script;
		scripts_container.appendChild( scripts_list.root );

		//fetch list
		this.fetchList( repository_url, inner_list );

		//list received from repository
		function inner_list(v)
		{
			if(!v)
				return;
			official_list = v.scripts;
			if(repository_url != official_url)
				preferences.repository_url = repository_url;
			else
				for(var i in v.scripts)
					v.scripts[i].official = true;
			updateScriptsList();
		}

		//user clicks item on the list
		function inner_select_item( v )
		{
			selected = v;
			title.setValue( v.name );
			author.setValue( v.author );
			version.setValue( v.version );
			description.setValue( v.description );
			script_url_widget.setValue( v.script_url );
			script_repository_widget.setValue( v.repository_url );
		}

		//user wants to add a new one to the list
		function inner_add_custom_script()
		{
			var script_info = {
				name: title.getValue(),
				author: author.getValue() || "",
				version: version.getValue() || "",
				description: description.getValue() || "",
				script_url: script_url_widget.getValue(),
				repository_url: repository_url,
				full_url: null //computed afterwards
			};

			if( !script_info.name || !script_info.script_url )
				return LiteGUI.alert("You must fill title and script_url");

			if( script_info.script_url.substr(0,4) == "http" ) //absolute path
				script_info.repository_url = "";

			script_info.full_url = script_info.repository_url + script_info.script_url;

			preferences.list.push( script_info );
			updateScriptsList();
		}

		//clear the from content
		function inner_clear_form()
		{
			title.setValue("");
			author.setValue("");
			version.setValue("");
			description.setValue("");
			script_url_widget.setValue("");
			script_repository_widget.setValue("");
			selected = null;
			LiteGUI.removeClass( scripts_container, ".selected", "selected" );
		}

		function inner_view_code(url)
		{
			LS.Network.requestText( url, function(code) {
				EditorModule.checkCode( code );
			});
		}

		//refresh the list
		function updateScriptsList()
		{
			scripts_list.clear();
			scripts_list.addTitle("Repository");
			var official_urls = {};

			for(var i in official_list)
			{
				var item = official_list[i];
				if( list_filter && item.name.toLowerCase().indexOf( list_filter ) == -1 )
					continue;
				var title = item.name;
				var is_included = options.on_is_included( item.full_url );
				var elem = scripts_list.addItem( item, "", is_included, false );
				elem.setContent( "<span>" + escapeHtmlEntities(title) + "<span><span class='subtitle'>" + escapeHtmlEntities(item.author) + " v"+item.version+"</span>", true );
				elem.classList.add("repository_script");
				official_urls[ item.full_url ] = true;
			}

			scripts_list.addTitle("Local");
			if(preferences.list && preferences.list.length)
			{
				var user_list = preferences.list;
				for(var i in user_list)
				{
					var item = user_list[i];
					if( list_filter && item.name.toLowerCase().indexOf( list_filter ) == -1 )
						continue;
					if( official_urls[ item.full_url ] )
						continue;
					var title = item.name;
					var is_included = options.on_is_included( item.full_url );
					var elem = scripts_list.addItem( item, "", is_included, true );
					elem.setContent( "<span>" + escapeHtmlEntities(title) + "<span><span class='subtitle'>" + escapeHtmlEntities(item.author) + " v"+item.version+"</span>", true );
					elem.classList.add("user_script");
				}
			}

			scripts_list.addHTML(" + add script from info panel", inner_add_custom_script);
		}

		function inner_toggle_script( item, elem )
		{
			//search in current list
			var url = LS.RM.cleanFullpath( item.full_url );
			var scripts_array = null;
			if( options.on_toggle_script( url, item, elem ) )
				elem.classList.add("included");
			else
				elem.classList.remove("included");
			if(on_callback)
				on_callback();
			return true;
		}

		function inner_remove_item( item, elem )
		{
			//search in current list
			var index = preferences.list.indexOf( item );
			if(index == -1)
				return;
			preferences.list.splice( index, 1 );
			updateScriptsList();
		}

		dialog.show();
	},

	fetchList: function( url, on_complete )
	{
		LiteGUI.requestJSON( url + "list.json", inner );
		function inner(v)
		{
			if(!v)
				return;
			for(var i in v.scripts)
			{
				var script = v.scripts[i];
				script.repository_url = url;
				script.full_url = script.repository_url + script.script_url;
			}
			on_complete(v);
		}
	}
}


CORE.registerModule( PluginsModule );