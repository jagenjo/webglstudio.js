var CORE = {

	config: null, //internal configuration
	user_preferences: {}, //stuff that the user can change and wants to keep

	Modules: [], //registered modules
	Widgets: [], //valid tab widgets (used by GenericTabsWidget)
	Scenes: [], //current scenes

	_modules_initialized: false,

	//called from index.html
	init: function( )
	{
		this.root = document.body;

		//Load config file
		LiteGUI.request({
			url:"config.json",
			dataType:"json",
			success: this.configLoaded.bind(this)
		});
	},

	configLoaded: function( config )
	{
		if(!config)
		{
			LiteGUI.alert("config.json not found");
			throw("config file missing");
		}
		this.config = config;

		//if inline modules
		if( config.modules && config.modules.constructor === Array )
		{
			this.loadModules( config );
			return;
		}

		//Load modules list from modules.json
		LiteGUI.request({
			url: config.modules || "modules.json",
			dataType:"json",
			success: this.loadModules.bind(this)
		});
	},

	//Loads all the files ***********************
	loadModules: function( modules_info )
	{
		if(!modules_info || !modules_info.modules)
		{
			LiteGUI.alert("modules.json not found");
			throw("modules file missing");
		}

		var modules_list = modules_info.modules;
		this.config.modules = modules_info;

		//intro loading text
		this.log("Loading modules...");
		var num = 0;
		for(var i in modules_list)
		{
			var module_name = modules_list[i];
			module_name = module_name.split("/").join("<span class='foldername-slash'>/</span>");
			CORE.log( "<span id='msg-module-"+ (num++) + "' class='tinybox'></span> <span class='name'>" + module_name + "</span>" );
		}

		LiteGUI.requireScript( modules_list, onReady, onError, onProgress );

		//one module loaded
		function onProgress( name, num )
		{
			var elem = document.querySelector( "#msg-module-" + num + ".tinybox" );
			if(elem)
				elem.classList.add("ok");
		}

		//one module loaded
		function onError(err, name, num)
		{
			var box = document.querySelector( "#msg-module-" + num + ".tinybox");
			var line = box.parentNode;
			line.classList.add("error");
			box.classList.add("error");
			console.error("Error loading module: " + line.querySelector(".name").innerHTML );
		}

		function onReady()
		{
			CORE.launch();
		}
	},

	//all modules loaded
	launch: function()
	{
		//remove loading info
		LiteGUI.remove(".startup-console-msg");

		//launch LiteGUI
		LiteGUI.init(); 

		//load local user preferences for every module
		this.loadUserPreferences();

		//Init all modules
		this.initModules();

		//some modules may need to be unloaded
		window.onbeforeunload = CORE.onBeforeUnload.bind(this);

		//config folders
		LS.ResourcesManager.setPath( CORE.config.resources );

		this.addScene( LS.GlobalScene );
		this.selectScene( LS.GlobalScene );

		//If you launch with a loading url
		/* UNSAFE
		if( LiteGUI.getUrlVar("session") )
			SceneStorageModule.loadLocalScene( LiteGUI.getUrlVar("session"));
		else if( LiteGUI.getUrlVar("server") )
			Scene.loadScene( ResourcesManager.path + "/scenes/" + LiteGUI.getUrlVar("server") );
		else if( LiteGUI.getUrlVar("scene") )
			Scene.loadScene( LiteGUI.getUrlVar("scene") );
		else if(window.SceneStorageModule && 0)
			SceneStorageModule.loadLocalScene("test");
		*/
	},

	// Modules system *******************************
	initModules: function()
	{
		var catch_exceptions = false;

		//pre init
		for(var i in this.Modules)
			if (this.Modules[i].preInit)
			{
				if(!catch_exceptions)
				{
					this.Modules[i].preInit();
					continue;
				}
				try
				{
					this.Modules[i].preInit();
				}
				catch (err)
				{
					console.error(err);
				}
			}

		//init
		for(var i in this.Modules)
			if (this.Modules[i].init && !this.Modules[i]._initialized)
			{
				if(!catch_exceptions)
				{
					this.Modules[i].init();
				}
				else
				{
					try
					{
						this.Modules[i].init();
					}
					catch (err)
					{
						console.error(err);
					}
				}
				this.Modules[i]._initialized = true;
			}

		//post init
		for(var i in this.Modules)
			if (this.Modules[i].postInit)
			{
				if(!catch_exceptions)
				{
					this.Modules[i].postInit();
				}
				else
				{
					try
					{
						this.Modules[i].postInit();
					}
					catch (err)
					{
						console.error(err);
					}
				}
			}

		this._modules_initialized = true;
	},

	registerModule: function( module )
	{
		this.Modules.push(module);
		//if(!module.name)
		//	console.warn("Module without name, some features wouldnt be available");

		//initialize on late registration
		if(this._modules_initialized)
		{
			if (module.preInit) module.preInit();
			if (module.init) module.init();
			if (module.postInit) module.postInit();
		}

		LiteGUI.trigger( CORE.root, "module_registered", module );
	},

	//used mostly to reload plugins
	removeModule: function( module )
	{
		var index = this.Modules.indexOf( module );
		if(index == -1)
			return;
		if(module.deinit)
			module.deinit();
		this.Modules.splice(index,1);
		LiteGUI.trigger( CORE.root, "module_removed", module );
	},

	getModule: function( module_name )
	{
		for(var i = 0; i < this.Modules.length; ++i)
			if(this.Modules[i].name == module_name )
				return this.Modules[i];
		return null;
	},

	isModule: function( module )
	{
		var index = this.Modules.indexOf( module );
		if(index == -1)
			return false;
		return true;
	},

	onBeforeUnload: function()
	{
		var warning = false;
		for(var i in this.Modules)
			if (this.Modules[i].onUnload)
				warning = warning || this.Modules[i].onUnload();

		//save preferences
		this.saveUserPreferences();

		return warning;
	},

	resetUserPreferences: function()
	{
		localStorage.removeItem("wgl_user_preferences" );
	},

	loadUserPreferences: function()
	{
		var preferences = null;

		//load user settings
		var data = localStorage.getItem("wgl_user_preferences" );
		if( data )
		{
			try
			{
				preferences = JSON.parse( data );
				this.user_preferences = preferences;
			}
			catch (err)
			{
			}
		}
		//removing preferences could mean that the preferences will be lost
		//localStorage.removeItem("wgl_user_preferences" );
		if(!preferences)
			return;

		if(preferences.modules)
			for(var i in preferences.modules)
			{
				var module_preferences = preferences.modules[i];
				var module = this.getModule(i);
				if(!module || !module.preferences)
					continue;
				LS.cloneObject( module_preferences, module.preferences, true, true ); //clone recursive and only_existing
			}
	},

	saveUserPreferences: function()
	{
		var preferences = { modules: {} };
		for(var i in this.Modules)
		{
			var module = this.Modules[i];
			var module_name = module.name;
			if(!module.preferences)
				continue;

			if(!module_name)
				console.warn("Module with preferences but without name, skipping saving preferences");
			else
				preferences.modules[ module_name ] = module.preferences;
		}

		var data = JSON.stringify( preferences );
		localStorage.setItem("wgl_user_preferences", data );
		return preferences;
	},

	//Scenes ****************************************
	addScene: function( scene )
	{
		if( this.Scenes.indexOf( scene ) != -1 )
			return;

		this.Scenes.push( scene );
	},

	selectScene: function( scene )
	{
		if(scene.constructor !== LS.SceneTree)
			throw("Not an scene");

		var old_scene = LS.GlobalScene;
		LEvent.trigger( this, "global_scene_selected", scene );
		LS.GlobalScene = scene;
	},

	registerWidget: function( widget )
	{
		this.Widgets.push( { title: widget.widget_name || widget.name, "class": widget });
	},

	// hub to redirect to the propper place
	inspect: function( object )
	{
		EditorModule.inspect( object );
	},

	//show in launching console ******************
	log: function( msg )
	{
		var e = document.createElement("p");
		e.innerHTML = msg;
		e.className = "startup-console-msg";
		this.root.appendChild(e);
	}
}