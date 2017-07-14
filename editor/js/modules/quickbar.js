/* Console module 
	It shows the QuickBar when pressing Contrl + Space and allows to launch commands (not JS commands, but special editor commands)
	It also allows to show messages in the console widget
*/

var QuickbarModule = {
	name: "quickbar",

	commands: {},

	is_visible: false,

	init: function()
	{
		this.create();
	},

	create: function()
	{
		LiteGUI.addCSS("\
			#quickbar { pointer-events: none; transition: all 0.4s; opacity: 0; color: white; position: absolute; bottom: 0; right: 0px; width: 100%; min-height: 100px; font-size: 1.4em; padding-right: 3px } \
			#quickbar.visible { opacity: 1; pointer-events: auto; }\
			#quickbar input {  border: 1px solid rgba(100,100,100,0.1); font-size: 2em; color: white; border: 0; background-color: rgba(0,0,0,0.5); border-radius: 4px; padding: 5px; margin: 20px; width: calc( 100% - 40px ); }\
			#quickbar input:focus { outline: 0; }\
		");

		this.quickbar = document.createElement("div");
		this.quickbar.id = "quickbar";

		this.quickbar.innerHTML = "<div class='content'></div><input type='text' />";
		this.content = this.quickbar.querySelector(".content");
		this.input = this.quickbar.querySelector("input");

		this.input.onblur = function() { QuickbarModule.hide(); };
		this.input.addEventListener("keydown", this.onKeyDown.bind(this) );

		var root = document.getElementById("visor");
		root.appendChild( this.quickbar );

		CORE.log = this.log;
	},

	log: function( msg )
	{
		LEvent.trigger( LS, "log", msg );	
	},

	onCanvasKeyDown: function(e)
	{
		if( e.keyCode == 32 && e.ctrlKey )
			this.toggle();
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

		for(var i in CORE.Modules)
		{
			var module = CORE.Modules[i];
			if(!module.commands)
				continue;

			var commands = module.commands;
			var callback = commands[ tokens[0] ];
			if(!callback)
				continue;
			callback(cmd, tokens);
		}
	},

	show: function()
	{
		this.quickbar.classList.add("visible");
		this.input.focus();
		this.input.value = "";
		this.is_visible = true;
	},

	hide: function()
	{
		this.quickbar.classList.remove("visible");
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

CORE.registerModule( QuickbarModule );