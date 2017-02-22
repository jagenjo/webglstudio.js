/* The Core is in charge of launching the app, loading any external JS file and register modules, it also handles user preferences */
var CORE = {

	config: null, //internal configuration
	user_preferences: {}, //stuff that the user can change and wants to keep

	server_url: null, //server to connect for login and files

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
			url:"config.json?nocache=" + getTime(),
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

		//if inline imports
		if( config.imports && config.imports.constructor === Array )
		{
			this.loadImports( config );
			return;
		}

		var nocache = "";
		if(config.nocache)
			nocache = "?=" + getTime();

		//Load modules list from modules.json
		LiteGUI.request({
			url: config.imports || "imports.json" + nocache,
			dataType:"json",
			success: this.loadImports.bind(this)
		});
	},

	//Loads all the files ***********************
	loadImports: function( imports_info )
	{
		if(!imports_info || !imports_info.imports)
		{
			LiteGUI.alert("imports.json not found");
			throw("imports file missing");
		}

		var imports_list = imports_info.imports;
		this.config.imports = imports_info;

		//intro loading text
		this.log("Loading imports...");
		var num = 0;
		for(var i in imports_list)
		{
			var import_name = imports_list[i];
			import_name = import_name.split("/").join("<span class='foldername-slash'>/</span>");
			CORE.log( "<span id='msg-import-"+ (num++) + "' class='tinybox'></span> <span class='name'>" + import_name + "</span>" );
		}

		//forces to redownload files
		if(this.config.nocache)
		{
			var nocache = "nocache=" + String(getTime());
			for(var i in imports_list)
				imports_list[i] = imports_list[i] + (imports_list[i].indexOf("?") == -1 ? "?" : "") + nocache;
		}

		//require all import scripts
		LiteGUI.requireScript( imports_list, onReady, onError, onProgress );

		//one module loaded
		function onProgress( name, num )
		{
			var elem = document.querySelector( "#msg-import-" + num + ".tinybox" );
			if(elem)
				elem.classList.add("ok");
		}

		//one module loaded
		function onError(err, name, num)
		{
			var box = document.querySelector( "#msg-import-" + num + ".tinybox");
			var line = box.parentNode;
			line.classList.add("error");
			box.classList.add("error");
			console.error("Error loading import: " + line.querySelector(".name").textContent );
		}

		function onReady()
		{
			CORE.launch();
		}
	},

	//all imports loaded
	launch: function()
	{
		//remove loading info
		LiteGUI.remove(".startup-console-msg");

		//launch LiteGUI
		LiteGUI.init(); 

		//load local user preferences for every systemo module
		this.loadUserPreferences();

		//Init all system modules
		this.initModules();

		//some modules may need to be unloaded
		window.onbeforeunload = CORE.onBeforeUnload.bind(this);

		this.addScene( LS.GlobalScene );
		this.selectScene( LS.GlobalScene );

		LiteGUI.trigger( CORE, "system_ready" );
	},

	// Modules system *******************************
	initModules: function()
	{
		var catch_exceptions = false;

		//pre init
		LiteGUI.trigger( CORE, "modules_preinit" );

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
		LiteGUI.trigger( CORE, "modules_postinit" );

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

	getUserPreferences: function()
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
				console.error("Error in user preferences");
			}
		}
		//removing preferences could mean that the preferences will be lost
		//localStorage.removeItem("wgl_user_preferences" );
		return preferences;
	},

	loadUserPreferences: function()
	{
		var preferences = this.getUserPreferences();
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

	//used for UNDO and COLLABORATE
	userAction: function( action, param1, param2 )
	{
		LiteGUI.trigger( this, "user_action", [action, param1, param2] );
	},

	//Scenes ****************************************
	addScene: function( scene )
	{
		if( this.Scenes.indexOf( scene ) != -1 )
			return;

		this.Scenes.push( scene );
	},

	selectScene: function( scene, save_current )
	{
		if(scene.constructor !== LS.SceneTree)
			throw("Not an scene");

		if(save_current)
			this.Scenes.push( scene );

		var old_scene = LS.GlobalScene;
		LEvent.trigger( this, "global_scene_selected", scene );
		LS.GlobalScene = scene;
		CORE.inspect( scene.root );
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