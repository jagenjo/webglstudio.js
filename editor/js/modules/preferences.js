/* 
	This module is in charge of controlling the global preferences of all the modules.
	It allow to configure every one of them using a common interface and to use a localStorage
	to save the previous configuration.
*/
var PreferencesModule = {

	name: "preferences",

	sections: {},
	current_section: "editor",

	init: function()
	{
		LiteGUI.menubar.add("Edit/Preferences", { order:20, callback: function() { PreferencesModule.showDialog(); }});
	},

	showDialog: function()
	{
		if(PreferencesModule.dialog)
		{
			PreferencesModule.dialog.highlight();
			return;
		}

		var dialog = new LiteGUI.Dialog({ id: "dialog_preferences", title:"Preferences", width: 800, height: 500, close: true, minimize: true, scroll: false, draggable: true });
		this.dialog = dialog;

		dialog.show();
		dialog.on_close = function() {
			PreferencesModule.dialog = null;
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
		var split = new LiteGUI.Split([30,70]);
		dialog.content.appendChild(split.root);
		dialog.content.style.height = "calc( 100% - 20px )";
		split.root.style.height = "100%";
		split.sections[1].style.overflow = "auto";
		split.sections[1].style.paddingLeft = "10px";
		split.sections[1].id = "preferences-widgets-area";
		split.sections[1].innerHTML = "<div class='content'></div>";

		var sections = [];
		var already_created = {};
		for(var i in CORE.Modules)
		{
			var module = CORE.Modules[i];
			if(!module.preferences_panel)
				continue;

			for(var j in module.preferences_panel)
			{
				var preferences = module.preferences_panel[j];

				if (already_created[ preferences.name ]) //avoid repeated
					continue;
				sections.push( preferences );
				this.sections[ preferences.name ] = preferences;
				already_created[ preferences.name ] = true;
			}
		}

		var list = new LiteGUI.List("preferences-list", sections );
		list.root.style.fontSize = "20px";
		split.sections[0].appendChild( list.root );
		split.sections[1].style.fontSize = "16px";

		list.callback = function(v) {
			PreferencesModule.changeSection( v.name );
		};

		list.setSelectedItem( this.sections[ this.current_section ] );
	},

	changeSection: function( name )
	{
		if(!this.dialog)
			return;

		this.current_section = name;

		var root = this.dialog.root.querySelector("#preferences-widgets-area .content");
		root.innerHTML = "";

		var widgets = new LiteGUI.Inspector({ id: "preferences-widgets", name_width:"40%" });
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		root.appendChild( widgets.root );

		for(var i in CORE.Modules)
		{
			if (!CORE.Modules[i].onShowPreferencesPanel)
				continue;
			CORE.Modules[i].onShowPreferencesPanel(name, widgets);
		}
	},
}


CORE.registerModule( PreferencesModule );