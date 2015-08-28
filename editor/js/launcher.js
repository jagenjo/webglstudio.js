$(function() {

	//Load Configuration file
	LiteGUI.request({
		url:"config.json",
		dataType:"json",
		success: onConfigLoaded
	});

	//Create the loading console
	var container = document.body;
	function toConsole(msg)
	{
		var e = document.createElement("p");
		e.innerHTML = msg;
		e.className = "startup-console-msg";
		container.appendChild(e);
	}

	//MODULE LOADER
	function onConfigLoaded(config)
	{
		LiteGUI.config = config;
		toConsole("Loading modules...");
		var num = 0;
		for(var i in config.modules)
			toConsole( "<span id='msg-module-"+ (num++) + "' class='tinybox'></span> <span class='name'>" + config.modules[i] + "</span>" );

		LiteGUI.requireScript( config.modules, onReady, onProgress, onError );
	}

	//one module loaded
	function onProgress( name, num )
	{
		//toConsole( " <span class='tinybox' style='background-color: #44ffaa'></span> " + name);
		$( "#msg-module-" + num + ".tinybox").addClass("ok");
		//console.log("Mod: ",name,num);
	}

	//one module loaded
	function onError(err, name, num)
	{
		var box = $( "#msg-module-" + num + ".tinybox");
		var line = box.parent();
		line.addClass("error");
		box.addClass("error");
		console.error("Error loading module: " + line.find(".name").html() );
	}


	//all modules loaded
	function onReady()
	{
		//remove loading info
		$(".startup-console-msg").remove(); //.innerHTML = ""; 

		//launch LiteGUI
		LiteGUI.init(); 

		//this init is called after all the GUI stuff is ready
		for(var i in LiteGUI.modules)
			if(LiteGUI.modules[i].initGUI)
				LiteGUI.modules[i].initGUI();

		//config folders
		ResourcesManager.setPath( LiteGUI.config.resources );

		//preload stuff		
		if( LiteGUI.getUrlVar("session") )
			SceneStorageModule.loadLocalScene( LiteGUI.getUrlVar("session"));
		else if( LiteGUI.getUrlVar("server") )
			Scene.loadScene( ResourcesManager.path + "/scenes/" + LiteGUI.getUrlVar("server") );
		else if( LiteGUI.getUrlVar("scene") )
			Scene.loadScene( LiteGUI.getUrlVar("scene") );
		else if(window.SceneStorageModule && 0)
			SceneStorageModule.loadLocalScene("test");
	}

});