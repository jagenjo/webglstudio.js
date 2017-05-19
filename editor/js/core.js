/* The Core is in charge of launching the app, loading any external JS file and register modules, it also handles user preferences */
var CORE = {

	config: null, //internal configuration
	user_preferences: {}, //stuff that the user can change and wants to keep

	server_url: null, //server to connect for login and files

	Modules: [], //registered modules
	Widgets: [], //valid tab widgets (used by GenericTabsWidget)
	Scenes: [], //current scenes
	ProxyScene: {},

	_modules_initialized: false,
	send_log_to_console: false,

	//called from index.html
	init: function( )
	{
		this.root = document.body;
		
		//Load config file
		LiteGUI.request({
			url:"config.json?nocache=" + performance.now(),
			dataType:"json",
			success: this.configLoaded.bind(this)
		});

		/*
		this.ProxyScene.onLEventBinded = function( event_type, callback, target_instance )
		{
		
		}

		this.ProxyScene.onLEventUnbinded = function( event_type, callback, target_instance )
		{
		
		}
		*/
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
			nocache = "?=" + performance.now();

		//Load modules list from modules.json
		LiteGUI.request({
			url: config.imports || "imports.json" + nocache,
			dataType:"json",
			nocache: true,
			success: this.loadImports.bind(this)
		});
	},

	//Loads all the files ***********************
	loadImports: function( imports_info )
	{
		var that = this;
		if(!imports_info || !imports_info.imports)
		{
			LiteGUI.alert("imports.json not found");
			throw("imports file missing");
		}

		var imports_list = imports_info.imports;
		this.config.imports = imports_info;

		this.showLoadingPopup( imports_list );

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
			var nocache = "nocache=" + String(performance.now());
			for(var i in imports_list)
				imports_list[i] = imports_list[i] + (imports_list[i].indexOf("?") == -1 ? "?" : "") + nocache;
		}

		//require all import scripts
		LiteGUI.requireScript( imports_list, onReady, onError, onProgress, this.config.imports.version );

		//one module loaded
		function onProgress( name, num )
		{
			that.onImportLoaded( name, num );
		}

		//one module loaded
		function onError(err, name, num)
		{
			var box = document.querySelector( "#msg-import-" + num + ".tinybox");
			var line = box.parentNode;
			line.classList.add("error");
			box.classList.add("error");
			console.error("Error loading import: " + line.querySelector(".name").textContent );
			CORE.log("Error launching WebGLStudio, some files missing",true);
		}

		function onReady()
		{
			that.log("Loading done",true);
			setTimeout(function(){ CORE.launch(); },500 );
		}
	},

	//all imports loaded
	launch: function()
	{
		//remove loading info
		LiteGUI.remove(".startup-console-msg");
		this.send_log_to_console = true;

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

	//similar to registerModule but adds some plugin specific features to help remove the plugin
	registerPlugin: function( plugin )
	{
		this.last_plugin = plugin;
		this.registerModule( plugin );
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

	afterUserAction: function( action, param1, param2 )
	{
		LiteGUI.trigger( this, "after_user_action", [action, param1, param2] );
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
	log: function( msg, scroll )
	{
		var e = document.createElement("p");
		e.innerHTML = msg;
		e.className = "startup-console-msg";
		var root = this.log_container || this.root;
		root.appendChild(e);
		if(scroll)
			root.scrollTop = 100000;
		if(this.send_log_to_console)
			console.log(msg);
	},

	showLoadingPopup: function( imports )
	{
		var num = 0;
		for(var i in imports)
			num++;
		var element = document.createElement("div");
		element.id = "loader-dialog";
		element.innerHTML = "<div class='title'><img src='imgs/webglstudio-icon.png' /></div><div class='loader'></div><div class='log'></div>";
		this.log_container = element.querySelector(".log");
		this.root.appendChild(element);
		element.info = {
			title: element.querySelector(".title"),
			loader: element.querySelector(".loader"),
			current: 0,
			total: num,
			progress: 0
		}
		this.loader_dialog = element;
	},

	onImportLoaded: function( name, num )
	{
		var elem = document.querySelector( "#msg-import-" + num + ".tinybox" );
		if(!elem)
			return;
		elem.classList.add("ok");
		this.log_container.scrollTop += elem.offsetTop;
		var info = this.loader_dialog.info;
		info.current++;
		info.progress = info.current / info.total;
		var f = (info.progress * 100).toFixed(0);
		var f2 = (info.progress * 100 + 5).toFixed(0);
		info.loader.style.backgroundImage = "-webkit-linear-gradient( left, #AAA, cyan "+f+"%, black "+f2+"%)";
		info.loader.style.backgroundImage = "-moz-linear-gradient( left, #AAA, cyan "+f+"%, black "+f2+"%)";
	}
}