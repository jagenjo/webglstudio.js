/* 
	This module is in charge of controlling the global preferences of all the modules.
	It allow to configure every one of them using a common interface and to use a localStorage
	to save the previous configuration.
*/

var AppSettings = {
	init: function()
	{
		LiteGUI.menubar.separator("Edit",20);
		LiteGUI.menubar.add("Edit/Preferences", { order:20, callback: function() { AppSettings.showSettings(); }});
	},

	showSettings: function()
	{
		$("#work-area").children().hide();

		var dialog = new LiteGUI.Dialog("dialog_settings", {title:"Settings", width: 800, height: 500, close: true, minimize: false, scroll: false, draggable: false });
		this.dialog = dialog;

		dialog.show();
		$(dialog).bind("closed",function() {
			$("#work-area").children().show();
			AppSettings.dialog = null;
			RenderModule.requestFrame();
		});

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
		dialog.content.style.height = "100%";
		split.root.style.height = "100%";
		split.sections[1].id = "settings-widgets-area";
		split.sections[1].innerHTML = "<div class='content'></div>";

		var sections = [];
		var already_created = {};
		for(var i in LiteGUI.modules)
		{
			if(!LiteGUI.modules[i].settings_panel) continue;

			for(var j in LiteGUI.modules[i].settings_panel)
			{
				if (already_created[LiteGUI.modules[i].settings_panel[j].name]) //avoid repeated
					continue;
				sections.push( LiteGUI.modules[i].settings_panel[j] );
				already_created[ LiteGUI.modules[i].settings_panel[j].name ] = true;
			}
		}

		var list = new LiteGUI.List("settings-list", sections );
		list.root.style.fontSize = "20px";
		split.sections[0].appendChild(list.root);
		split.sections[1].style.fontSize = "18px";

		list.callback = function(v) {
			AppSettings.changeSection(v.name );
		};
	},

	changeSection: function(name)
	{
		if(!this.dialog)
			return;

		var root = $("#settings-widgets-area .content");
		root.empty();
		root.append("<h2>"+name+"</h2>");

		var widgets = new LiteGUI.Inspector("settings-widgets",{ name_width:"40%" });
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		root.append(widgets.root);

		for(var i in LiteGUI.modules)
		{
			if (!LiteGUI.modules[i].onShowSettingsPanel)
				continue;
			LiteGUI.modules[i].onShowSettingsPanel(name, widgets);
		}
	},
}


LiteGUI.registerModule( AppSettings );