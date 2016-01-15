//This module is in charge of creating the application interface (menus, sidepanels, tabs, statusbar, etc)
var InterfaceModule = {

	init: function()
	{
		if(!CORE.user_preferences.interface)
			CORE.user_preferences.interface = {};

		//create menubar
		LiteGUI.createMenubar();

		//fill menubar with sections
		LiteGUI.menubar.add("Project");
		LiteGUI.menubar.add("Edit");
		LiteGUI.menubar.add("View");
		LiteGUI.menubar.add("Node");
		LiteGUI.menubar.add("Scene");
		LiteGUI.menubar.add("Actions");

		var side_panel_width = CORE.user_preferences.interface.side_panel_width || 300;

		//create a main container and split it in two (workarea: leftwork, sidebar)
		var mainarea = new LiteGUI.Area("mainarea",{content_id:"workarea", height: "calc(100% - 30px)", autoresize: true, inmediateResize: true, minSplitSize: 200 });
		mainarea.split("horizontal",[null, side_panel_width], true);
		this.mainarea = mainarea;
		//globalarea.getSection(1).add( mainarea );
		LiteGUI.add( mainarea );

		LiteGUI.bind( mainarea, "split_moved", function(e){
			CORE.user_preferences.interface.side_panel_width = InterfaceModule.mainarea.getSection(1).getWidth();
		});

		//var workarea_split = mainarea.getSection(0);
		//workarea_split.content.innerHTML = "<div id='visor'></div>";

		this.createTabs();
		this.createSidePanel();

		//window.onbeforeunload = function() { return "You work will be lost."; };
	},

	createTabs: function()
	{
		var main_tabs = new LiteGUI.Tabs("worktabs", { width: "full", mode: "vertical" });
		this.mainarea.getSection(0).add( main_tabs );
		//document.getElementById("leftwork").appendChild( main_tabs.root );
		LiteGUI.main_tabs = main_tabs;
	},

	selectTab: function(name)
	{
		return LiteGUI.main_tabs.selectTab(name);
	},

	createLowerArea: function()
	{
		var visorarea = this.visorarea = new LiteGUI.Area("visorarea",{ autoresize: true, inmediateResize: true});
		//document.getElementById("leftwork").appendChild( visorarea.root );
		this.mainarea.getSection(0).add( visorarea );

		visorarea.split("vertical",[null,200], true);
		visorarea.getSection(0).content.innerHTML = "<div id='visor'></div>";
		visorarea.getSection(1).content.innerHTML = "";
	},

	createSidePanel: function()
	{
		this.side_panel_visibility = true;

		//test dock panel
		var docked = new LiteGUI.Panel("side_panel", {title:'side panel'});
		this.mainarea.getSection(1).add( docked );
		LiteGUI.sidepanel = docked;

		//close button
		var close_button = new LiteGUI.Button( LiteGUI.special_codes.close , function() { InterfaceModule.setSidePanelVisibility(); });
		close_button.root.style.float = "right";
		close_button.content.style.width = "20px";
		docked.header.appendChild( close_button.root );

		//split button
		var split_button = new LiteGUI.Button("-", function() { InterfaceModule.splitSidePanel(); });
		split_button.root.style.float = "right";
		split_button.content.style.width = "20px";
		docked.header.appendChild( split_button.root );


		//tabs 
		var tabs_widget = new LiteGUI.Tabs("paneltabs", { size: "full" });
		tabs_widget.addTab("Scene Tree", {selected:true, id:"nodelist", size: "full", width: "100%"});
		tabs_widget.addTab("Inspector", { size: "full" });
		docked.add( tabs_widget );
		this.sidepaneltabs = tabs_widget;

		LiteGUI.menubar.add("Window/Side panel", { callback: function() { InterfaceModule.setSidePanelVisibility(); } });
		LiteGUI.menubar.add("Window/Low panel", { callback: function() { InterfaceModule.setLowerPanelVisibility(); } });
		LiteGUI.menubar.add("Window/Floating panel", { callback: function() { GenericTabsWidget.createDialog(); } });
		LiteGUI.menubar.add("Window/Inspector panel", { callback: function() { InspectorWidget.createDialog(); } });

		//LiteGUI.menubar.add("Window/show view app", { callback: function() { window.open("simple.html"); } });

		/*
		LiteGUI.menubar.add("Window/maximized", { checkbox: false, callback: function(v) { 
			if(v.checkbox)
				LiteGUI.setWindowSize();
			else
				LiteGUI.setWindowSize(1000,600);
		}});
		*/
		LiteGUI.menubar.add("About", { callback: function() { 
			LiteGUI.showMessage("<p>WebGLStudio version "+CORE.config.version+"</p><p>Created by <a href='http://blog.tamats.com' target='_blank'>Javi Agenjo</a></p><p><a href='http://gti.upf.edu/' target='_blank'>GTI department</a> of <a href='http://www.upf.edu' target='_blank'>Universitat Pompeu Fabra</a></p><p><a href='#'>Github</a></a>", {title:"About info"});
		}});

		//split in top-bottom for header and workarea
		var sidepanelarea = new LiteGUI.Area("sidepanelarea",{ autoresize: true, inmediateResize: true });
		sidepanelarea.split("vertical",["30%",null], true);
		sidepanelarea.hide();
		LiteGUI.sidepanel.splitarea = sidepanelarea;
		LiteGUI.sidepanel.add( sidepanelarea );

		//create scene tree
		this.scene_tree = new SceneTreeWidget("sidepanel-inspector");
		tabs_widget.getTab("Scene Tree").add( this.scene_tree );

		//create inspector
		EditorModule.inspector = this.inspector_widget = new InspectorWidget();
		tabs_widget.getTab("Inspector").add( this.inspector_widget );

		/*
		this.inspector = new LiteGUI.Inspector("sidepanel-inspector", {name_width: "40%" });
		this.inspector.onchange = function()
		{
			RenderModule.requestFrame();
		}
		tabs_widget.getTab("Inspector").add( this.inspector );
		this.inspector.addInfo(null,"select something to see its attributes");
		EditorModule.inspector = this.inspector; //LEGACY
		*/

		//default
		tabs_widget.selectTab("Inspector");
		this.splitSidePanel();
	},

	splitSidePanel: function()
	{
		var tabs = this.sidepaneltabs;
		var sidepanelarea = LiteGUI.sidepanel.splitarea;

		var tree = this.scene_tree.root;
		var attr = this.inspector_widget.root;

		if(!this.is_sidepanel_splitted)
		{
			tree.style.display = attr.style.display = "block";
			tree.style.height = attr.style.height = "100%";
			tabs.hide();
			sidepanelarea.show();

			sidepanelarea.getSection(0).add( tree );
			sidepanelarea.getSection(0).root.style.overflow = "auto";
			sidepanelarea.getSection(1).add( attr );
			sidepanelarea.getSection(1).root.style.overflow = "auto";
			this.is_sidepanel_splitted = true;
		}
		else
		{
			tabs.getTab("Scene Tree").content.appendChild( tree );
			tabs.getTab("Inspector").content.appendChild( attr );

			tabs.show();
			sidepanelarea.hide();

			this.is_sidepanel_splitted = false;
		}
	},

	/*
	inspectNode: function(node)
	{
	},
	*/

	//show side panel
	toggleInspectorTab: function()
	{
		var tabs = this.sidepaneltabs;
		var current = tabs.getCurrentTab();
		if(current[0] != "Inspector") 
			tabs.selectTab("Inspector");
		else
			tabs.selectTab("Scene Tree");
	},

	getSidePanelVisibility: function(v)
	{
		return this.side_panel_visibility;
	},

	createSidebarOpener: function()
	{
		if(this.opensidepanel_button)
			return;

		var visor = document.getElementById("visor");
		if(!visor)
			return;

		var open_button = this.opensidepanel_button = document.createElement("button");
		open_button.className = "opensidepanel-button";
		open_button.innerHTML = "<";
		visor.appendChild( open_button );
		open_button.style.display = "none";
		open_button.addEventListener("click", function() { InterfaceModule.setSidePanelVisibility(true); });
	},

	setSidePanelVisibility: function(v)
	{
		if (v === undefined)
			v = !this.side_panel_visibility;

		if(!this.opensidepanel_button)
			this.createSidebarOpener();

		this.side_panel_visibility = v;
		if(v)
		{
			this.mainarea.showSection(1);
			if(this.opensidepanel_button)
				this.opensidepanel_button.style.display = "none";
		}
		else
		{
			this.mainarea.hideSection(1);
			if(this.opensidepanel_button)
				this.opensidepanel_button.style.display = "block";
		}
	},

	//created inside RenderModule 
	setVisorArea: function( area )
	{
		this.visorarea = area;

		var lower_tabs_widget = this.lower_tabs_widget = new GenericTabsWidget();
		this.visorarea.getSection(1).add( lower_tabs_widget );

		/*
		//add lower panel tabs
		var lower_tabs_widget = new LiteGUI.Tabs("lowerpaneltabs", { size: "full" });
		this.visorarea.getSection(1).add( lower_tabs_widget );
		this.lower_tabs_widget = lower_tabs_widget;
		*/

		//add close button
		var button = LiteGUI.createButton("close_lowerpanel", LiteGUI.special_codes.close , function(){
			InterfaceModule.setLowerPanelVisibility(false);
		});
		button.style.float = "right";
		button.style.minWidth = "20px";
		this.lower_tabs_widget.tabs.tabs_root.appendChild(button);
	},

	setLowerPanelVisibility: function(v)
	{
		if (v === undefined)
			v = !this.lower_panel_visibility;

		this.lower_panel_visibility = v;
		if(v)
			this.visorarea.showSection(1);
		else
			this.visorarea.hideSection(1);

		CORE.user_preferences.interface.show_timeline = v;
		LiteGUI.trigger( this.visorarea.root, "visibility_change" );
	},
};

CORE.registerModule( InterfaceModule );