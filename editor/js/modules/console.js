var ConsoleModule = {

	commands: {},

	is_visible: false,

	init: function()
	{
		this.create();
	},

	create: function()
	{
		LiteGUI.addCSS("\
			#console { pointer-events: none; transition: all 0.4s; opacity: 0; color: white; position: absolute; bottom: 0; right: 0px; width: 100%; min-height: 100px; font-size: 1.4em; padding-right: 3px } \
			#console.visible { opacity: 1; pointer-events: auto; }\
			#console input {  border: 1px solid rgba(100,100,100,0.1); font-size: 2em; color: white; border: 0; background-color: rgba(0,0,0,0.5); border-radius: 4px; padding: 5px; margin: 20px; width: calc( 100% - 40px ); }\
			#console input:focus { outline: 0; }\
		");

		this.console = document.createElement("div");
		this.console.id = "console";

		this.console.innerHTML = "<div class='content'></div><input type='text' />";
		this.content = this.console.querySelector(".content");
		this.input = this.console.querySelector("input");

		this.input.onblur = function() { ConsoleModule.hide(); };
		this.input.addEventListener("keydown", this.onKeyDown.bind(this) );

		var root = document.getElementById("visor");
		root.appendChild( this.console );
	},

	onKeyDown: function(e)
	{
		if(e.keyCode == 13)
		{
			this.executeCommand( e.target.value );	
			e.target.value = "";
			e.preventDefault();
		}
		else if (e.keyCode == 27)
			this.hide();
	},

	executeCommand: function(cmd)
	{
		if(!cmd)
			return;

		cmd = cmd.trim();
		var tokens = cmd.split(" ");

		for(var i in LiteGUI.modules)
		{
			if(!LiteGUI.modules[i].commands)
				continue;

			var commands = LiteGUI.modules[i].commands;
			var callback = commands[ tokens[0] ];
			if(!callback)
				continue;
			callback(cmd, tokens);
		}
	},

	show: function()
	{
		this.console.classList.add("visible");
		this.input.focus();
		this.input.value = "";
		this.is_visible = true;
	},

	hide: function()
	{
		this.console.classList.remove("visible");
		this.input.blur();
		this.is_visible = false;
	},

	toggle: function()
	{
		if(this.is_visible)
			this.hide();
		else
			this.show();
	}

};

LiteGUI.registerModule( ConsoleModule );