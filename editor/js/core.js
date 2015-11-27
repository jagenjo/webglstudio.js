var CORE = {

	config: null, //internal configuration
	user_preferences: {}, //stuff that the user can change and wants to keep

	//registered modules
	Modules: [],
	Scenes: [],

	_modules_initialized: false,

	//called from index.html
	init: function( )
	{
		this.root = document.body;

		//Load Configuration file
		LiteGUI.request({
			url:"config.json",
			dataType:"json",
			success: this.loadFiles.bind(this)
		});
	},

	//Loads all the files ***********************
	loadFiles: function( config )
	{
		if(!config)
			throw("config file missing");
		this.config = config;

		//intro loading text
		this.log("Loading modules...");
		var num = 0;
		for(var i in config.modules)
			CORE.log( "<span id='msg-module-"+ (num++) + "' class='tinybox'></span> <span class='name'>" + config.modules[i] + "</span>" );

		LiteGUI.requireScript( config.modules, onReady, onError, onProgress );

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

		//load user settings
		var data = localStorage.getItem("wgl_user_preferences" );
		if( data )
		{
			try
			{
				this.user_preferences = JSON.parse( data );
			}
			catch (err)
			{
			}
		}
		

		//Init all modules
		this.initModules();

		//some modules may need to be unloaded
		window.onbeforeunload = CORE.onUnload.bind(this);

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

	isModule: function( module )
	{
		var index = this.Modules.indexOf( module );
		if(index == -1)
			return false;
		return true;
	},

	onUnload: function()
	{
		for(var i in this.Modules)
			if (this.Modules[i].onUnload)
				this.Modules[i].onUnload();

		if(this.user_preferences)
		{
			var data = JSON.stringify( this.user_preferences );
			localStorage.setItem("wgl_user_preferences", data );
		}
	},

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