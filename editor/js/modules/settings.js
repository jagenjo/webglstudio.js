/* 
	This module is in charge of controlling the global preferences of all the modules.
	It allow to configure every one of them using a common interface and to use a localStorage
	to save the previous configuration.
*/
var SettingsModule = {

	sections: {},
	current_section: "editor",

	init: function()
	{
		LiteGUI.menubar.add("Edit/Preferences", { order:20, callback: function() { SettingsModule.showSettings(); }});
	},

	showSettings: function()
	{
		if(SettingsModule.dialog)
		{
			SettingsModule.dialog.highlight();
			return;
		}

		var dialog = new LiteGUI.Dialog("dialog_settings", {title:"Settings", width: 800, height: 500, close: true, minimize: true, scroll: false, draggable: true });
		this.dialog = dialog;

		dialog.show();
		dialog.on_close = function() {
			SettingsModule.dialog = null;
		}

		this.updateDialogContent();
	},

	updateDialogContent: function()
	{
		var dialog = this.dialog;
		if(!dialog)
			return;

		//remove old
		dialog.content.innerHTML = "";

		//content
		var split = new LiteGUI.Split("settings-content",[30,70]);
		dialog.content.appendChild(split.root);
		dialog.content.style.height = "calc( 100% - 20px )";
		split.root.style.height = "100%";
		split.sections[1].style.overflow = "auto";
		split.sections[1].id = "settings-widgets-area";
		split.sections[1].innerHTML = "<div class='content'></div>";

		var sections = [];
		var already_created = {};
		for(var i in CORE.modules)
		{
			var module = CORE.modules[i];
			if(!module.settings_panel)
				continue;

			for(var j in module.settings_panel)
			{
				var settings = module.settings_panel[j];

				if (already_created[ settings.name ]) //avoid repeated
					continue;
				sections.push( settings );
				this.sections[ settings.name ] = settings;
				already_created[ settings.name ] = true;
			}
		}

		var list = new LiteGUI.List("settings-list", sections );
		list.root.style.fontSize = "20px";
		split.sections[0].appendChild( list.root );
		split.sections[1].style.fontSize = "16px";

		list.callback = function(v) {
			SettingsModule.changeSection( v.name );
		};

		list.setSelectedItem( this.sections[ this.current_section ] );
	},

	changeSection: function( name )
	{
		if(!this.dialog)
			return;

		this.current_section = name;

		var root = this.dialog.root.querySelector("#settings-widgets-area .content");
		root.innerHTML = "";

		var widgets = new LiteGUI.Inspector("settings-widgets",{ name_width:"40%" });
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		root.appendChild( widgets.root );

		for(var i in CORE.modules)
		{
			if (!CORE.modules[i].onShowSettingsPanel)
				continue;
			CORE.modules[i].onShowSettingsPanel(name, widgets);
		}
	},
}


CORE.registerModule( SettingsModule );