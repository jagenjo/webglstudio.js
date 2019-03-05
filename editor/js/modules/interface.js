//This module is in charge of creating the application interface (menus, sidepanels, tabs, statusbar, etc)


var InterfaceModule = {
	name: "interface",

	preferences: { 
		show_low_panel: true,
		side_panel_width: 300
	},

	resource_icons: {
		"Texture": "imgs/mini-icon-texture.png",
		"Sampler": "imgs/mini-icon-texture.png",
		"Mesh": "imgs/mini-icon-meshres.png",
		"Node": "imgs/mini-icon-node.png",
		"node": "imgs/mini-icon-node.png",
		"Component": "imgs/mini-icon-component.png",
		"component": "imgs/mini-icon-component.png",
		"Material": "imgs/mini-icon-materialres.png",
		"material": "imgs/mini-icon-materialres.png",
		"Script": "imgs/mini-icon-js.png"
	},

	init: function()
	{
		//create menubar
		LiteGUI.createMenubar(null,{sort_entries: false});

		//fill menubar with sections
		LiteGUI.menubar.add("Project");
		LiteGUI.menubar.add("Edit");
		LiteGUI.menubar.add("View");
		LiteGUI.menubar.add("Node");
		LiteGUI.menubar.add("Scene");
		LiteGUI.menubar.add("Actions");

		var side_panel_width = this.preferences.side_panel_width || 360;

		//create a main container and split it in two (workarea: leftwork, sidebar)
		var mainarea = new LiteGUI.Area({ id: "mainarea", content_id:"workarea", height: "calc(100% - 30px)", autoresize: true, inmediateResize: true, minSplitSize: 200 });
		mainarea.split("horizontal",[null, side_panel_width], true);
		this.mainarea = mainarea;
		//globalarea.getSection(1).add( mainarea );
		LiteGUI.add( mainarea );

		LiteGUI.bind( mainarea, "split_moved", function(e){
			//store width
			var w = InterfaceModule.mainarea.getSection(1).getWidth();
			if(w)
				InterfaceModule.preferences.side_panel_width = w;
			InterfaceModule.lower_tabs_widget.onResize();
		});

		//var workarea_split = mainarea.getSection(0);
		//workarea_split.content.innerHTML = "<div id='visor'></div>";

		this.createTabs();
		this.createSidePanel();

		LiteGUI.createDropArea( mainarea.root, this.onItemDrop.bind(this) );
		
		document.addEventListener("keydown", this.globalKeyDown.bind(this), false );

		//window.onbeforeunload = function() { return "You work will be lost."; };
	},

	createTabs: function()
	{
		var main_tabs = new LiteGUI.Tabs( { id: "worktabs", width: "full", mode: "vertical", autoswitch: true });
		this.mainarea.getSection(0).add( main_tabs );
		//document.getElementById("leftwork").appendChild( main_tabs.root );
		LiteGUI.main_tabs = main_tabs;
	},

	selectTab: function(name)
	{
		return LiteGUI.main_tabs.selectTab(name);
	},

	/*
	createLowerArea: function()
	{
		var visorarea = this.visorarea = new LiteGUI.Area("visorarea",{ autoresize: true, inmediateResize: true});
		//document.getElementById("leftwork").appendChild( visorarea.root );
		this.mainarea.getSection(0).add( visorarea );

		visorarea.split("vertical",[null,200], true);
		visorarea.getSection(0).content.innerHTML = "<div id='visor'><div id='maincanvas'></div><div id='statusbar'><span class='status-msg'></div></div></div>";
		visorarea.getSection(1).content.innerHTML = "";

		//toggle statusbar console panel
		visorarea.root.querySelector( "#statusbar" ).addEventListener("click", InterfaceModule.toggleStatusBar.bind( InterfaceModule ) );

		LiteGUI.bind( visorarea, "split_moved", function(e){
			InterfaceModule.lower_tabs_widget.onResize();
		});
	},
	*/

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
		var tabs_widget = new LiteGUI.Tabs( { id: "paneltabs", size: "full" });
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

		//split in top-bottom for header and workarea
		var sidepanelarea = new LiteGUI.Area({ id: "sidepanelarea", autoresize: true, inmediateResize: true });
		sidepanelarea.split("vertical",["30%",null], true);
		sidepanelarea.hide();
		LiteGUI.sidepanel.splitarea = sidepanelarea;
		LiteGUI.sidepanel.add( sidepanelarea );

		//create scene tree
		this.scene_tree = new SceneTreeWidget({ id: "sidepanel-inspector" });
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

	setStatusBar: function(text, classname)
	{
		text = text || "";
		var msg = document.querySelector("#statusbar .msg");
		if(!msg)
			return;
		msg.innerHTML = text;
		msg.className = "msg " + (classname || "");
		return msg;
	},

	toggleStatusBar: function()
	{
		console.log("toggle status bar");
		var visorarea = this.visorarea;
		var maincanvas = visorarea.root.querySelector("#maincanvas");
		var status = visorarea.root.querySelector("#statusbar");

		if( maincanvas.style.height != "50%" )
		{
			maincanvas.style.height = "50%";
			status.style.height = "50%";
			status.classList.add("expanded");
		}
		else
		{
			maincanvas.style.height = "";
			status.style.height = "";
			status.classList.remove("expanded");
		}
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

	//something dragged into the canvas
	onItemDrop: function(e)
	{
		//reverse order
		for(var i = CORE.Modules.length - 1; i >= 0; --i )
		{
			var module = CORE.Modules[i];
			if(module == this) //avoid recursion!
				continue;
			if(!module.onItemDrop)
				continue;
			if(module.onItemDrop(e))
				return; //break
		}
	},

	// send keydown to current tab module
	globalKeyDown: function(e)
	{

		if(e.keyCode == 27 && document.activeElement.closest ) //ESC: close dialog
		{
			var dialog_element = document.activeElement.closest(".litedialog");
			if( dialog_element && dialog_element.dialog )
				dialog_element.dialog.close();
			return;
		}

		var target_element = e.target.nodeName.toLowerCase();
		if(target_element === "input" || target_element === "textarea" || target_element === "select")
			return;

		if(LiteGUI.focus_widget && LiteGUI.focus_widget.onKeyDown)
		{
			var r = LiteGUI.focus_widget.onKeyDown(e);
			if(r)
				return;
		}

		var current_tab = LiteGUI.main_tabs.current_tab[2];
		if(!current_tab) 
			return;

		var module = current_tab.module;
		if(module && module.onKeyDown)
			return module.onKeyDown(e);
	},

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

		var open_button = this.opensidepanel_button = document.createElement("div");
		open_button.className = "opensidepanel-button";
		open_button.innerHTML = "&#10096;";
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
		var lower_tabs_widget = new LiteGUI.Tabs( { id: "lowerpaneltabs", size: "full" });
		this.visorarea.getSection(1).add( lower_tabs_widget );
		this.lower_tabs_widget = lower_tabs_widget;
		*/

		//add close button
		var button = LiteGUI.createButton("close_lowerpanel", LiteGUI.special_codes.close , function(){
			InterfaceModule.setLowerPanelVisibility(false);
		}, "position: absolute; top: 0; right: 2px; margin: 0; min-width: 20px; background: #333; box-shadow: 0 0 0 transparent;");
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

		this.preferences.show_low_panel = v;
		LiteGUI.trigger( this.visorarea.root, "visibility_change" );
		this.lower_tabs_widget.onResize();
	},
};

CORE.registerModule( InterfaceModule );


//EXTRA WIDGETS for the Inspector ************************************************
LiteGUI.Inspector.widget_constructors["position"] = LiteGUI.Inspector.prototype.addVector3;


//to select a node, it uses identifiers, if you want to use nodes then add options.use_node
function generalNodeWidget( name, value, options, force_node )
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;

	var node_name = "";

	//value is always a node
	if( value && value.constructor == LS.SceneNode )
		node_name = value.name;
	else if(value && value.constructor == String)
	{
		node_name = value;
		value = LS.GlobalScene.getNode(node_name);
	}
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+node_name+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");
	input.style.background = "transparent url('" + InterfaceModule.resource_icons.node +"') no-repeat left 4px center";
	input.style.paddingLeft = "1.7em";
	input.setAttribute("placeHolder","Node");

	input.addEventListener("change", function(e) { 
		if( force_node )
			value = LS.GlobalScene.getNode( e.target.value );
		else
			value = e.target.value;
		LiteGUI.Inspector.onWidgetChange.call(that, element, name, value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectNode( inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, element.querySelector(".wcontent input").value );
	});

	element.addEventListener("dragover",function(e){ 
		e.preventDefault();
	},true);


	element.addEventListener("drop", function(e){
		e.preventDefault();
		e.stopPropagation();
		var node_uid = e.dataTransfer.getData("node_uid");
		if(force_node) //options.use_node
		{
			value = LS.GlobalScene.getNode( node_uid );
			input.value = value ? value.name : value;
		}
		else
		{
			value = node_uid;
			input.value = value;
		}
		LiteGUI.Inspector.onWidgetChange.call(that, element, name, value, options);
		return false;
	}, true);


	//after selecting a node
	function inner_onselect( node )
	{
		if(options.use_node || force_node)
		{
			value = node;
			input.value = node ? node.name : "";
		}
		else
		{
			value = node ? node.name : null;
			input.value = value;
		}

		LiteGUI.Inspector.onWidgetChange.call(that, element, name, value, options);
		//LiteGUI.trigger( input, "change" );
	}

	element.getValue = function() { return value; }
	element.setValue = inner_onselect;

	this.tab_index += 1;
	this.append(element);
	return element;
}

LiteGUI.Inspector.prototype.addNode = function( name, value, options )
{
	return generalNodeWidget.call(this, name, value, options, true );
}

LiteGUI.Inspector.widget_constructors["scenenode"] = "addNode";
LiteGUI.Inspector.widget_constructors["node"] = "addNode";

LiteGUI.Inspector.prototype.addNodeId = function( name, value, options )
{
	return generalNodeWidget.call(this, name, value, options, false );
}

LiteGUI.Inspector.widget_constructors[ LS.TYPES.SCENENODE_ID ] = "addNodeId";


//to select a node, value must be a valid node identifier (not the node itself)
LiteGUI.Inspector.prototype.addComponent = function( name, value, options )
{
	options = options || {};
	value = value || null;
	var that = this;
	this.values[ name ] = value;
	var input_text = "";
	if(value )
	{
		if( !value.constructor.is_component)
			console.warn("value must be component");
		else
			input_text = value.getLocator(); //getObjectClassName(value); 
	}
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+input_text+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		var v = null;
		if(e.target.value)
			v = LSQ.get( e.target.value ); //do not change value here, it needs to remain different to trigger events
		LiteGUI.Inspector.onWidgetChange.call( that, element, name, v, options );
	});

	var old_callback = options.callback;
	options.callback = inner_onselect;

	input.style.background = "transparent url('" + InterfaceModule.resource_icons.component +"') no-repeat left 4px center";
	input.style.paddingLeft = "1.7em";
	input.setAttribute("placeHolder","Component");
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectComponent( value, options.filter || options.component_class , options.callback, element );
		if(options.callback_button)
			options.callback_button.call( element, value );
	});

	element.addEventListener("drop", function(e){
		e.preventDefault();
		e.stopPropagation();
		var locator = e.dataTransfer.getData("locator");
		var comp = LSQ.get( locator );
		if(!comp || !comp.constructor.is_component)
			return;
		if( options.component_class && comp.constructor !== LS.Components[ options.component_class ] )
			return; //not the right type of component
		//input.value = LS.getObjectClassName( comp );
		input.value = comp.getLocator();
		//value = comp; 
		LiteGUI.trigger( input, "change" );
		return false;
	}, true);

	//after selecting a node or modifying the input.value
	function inner_onselect( component, event )
	{
		if( value == component ) //sometimes the value is already assigned in a previous step 
			return;
		if( component && !component.constructor.is_component )
			return;
		value = component;
		//input.value = component ? LS.getObjectClassName( component ) : "";
		input.value = component ? component.getLocator() : "";
		if(event && event.type !== "change") //to avoid triggering the change event infinitly
			LiteGUI.trigger( input, "change" );
		if(old_callback)
			old_callback.call( element, value );
	}

	this.tab_index += 1;
	this.append(element);
	//LiteGUI.focus( input );
	return element;
}
LiteGUI.Inspector.widget_constructors[ LS.TYPES.COMPONENT ] = "addComponent";

//to select a node, value must be a valid node identifier (not the node itself)
LiteGUI.Inspector.prototype.addComponentUID = function( name, value, options )
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});

	var old_callback = options.callback;
	options.callback = inner_onselect;

	input.style.background = "transparent url('" + InterfaceModule.resource_icons.component +"') no-repeat left 4px center";
	input.style.paddingLeft = "1.7em";
	input.setAttribute("placeHolder","Component");
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectComponent( value, options.filter || options.component_class , options.callback, element );
		if(options.callback_button)
			options.callback_button.call(element, input.value );
	});

	element.addEventListener("drop", function(e){
		e.preventDefault();
		e.stopPropagation();
		var locator = e.dataTransfer.getData("locator");
		var comp = LSQ.get( locator );
		if( options.component_class && comp.constructor !== LS.Components[ options.component_class ] )
			return; //not the right type of component
		if( comp && comp.constructor.is_component )
		{
			input.value = locator;
			LiteGUI.trigger( input, "change" );
		}
		return false;
	}, true);


	//after selecting a node
	function inner_onselect( component, event )
	{
		var component_uid = null;
		if(component && component.constructor !== String)
			component_uid = component.uid;
		else
			component_uid = component;

		if(value == component_uid)
			return;
		
		value = component_uid || "";
		if(input.value != value)
			input.value = value;
		
		if(event && event.type !== "change") //to avoid triggering the change event infinitly
			LiteGUI.trigger( input, "change" );

		if(old_callback)
			old_callback.call( element, value );
	}

	this.tab_index += 1;
	this.append(element);
	//LiteGUI.focus( input );
	return element;
}
LiteGUI.Inspector.widget_constructors[ LS.TYPES.COMPONENT_ID ] = "addComponentUID";

/*
//to select a component from a node
LiteGUI.Inspector.prototype.addNodeComponent = function(name, value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectNode( inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, element.querySelector(".wcontent input").value );
	});

	//after selecting a node
	function inner_onselect( node )
	{
		input.value = node ? node._name : "";
		LiteGUI.trigger( input, "change" );
	}

	this.tab_index += 1;
	this.append(element);
	return element;
}
LiteGUI.Inspector.widget_constructors["node_component"] = "addNodeComponent";
*/

//To select any kind of resource
//used by addResource, addMaterial, etc
function addGenericResource ( name, value, options, resource_classname )
{
	options = options || {};
	value = value || "";
	var that = this;

	var error_color = "#F43";
	var modified_color = "#E4E";

	resource_classname = resource_classname || options.resource_classname;

	if(value.constructor !== String)
		value = "@Object";

	this.values[name] = value;

	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button title='show folders' class='micro'>"+(options.button || LiteGUI.special_codes.open_folder )+"</button>", options);

	//INPUT
	var input = element.querySelector(".wcontent input");

	//resource missing
	if(value && value.constructor === String && value[0] != ":" && value[0] != "@")
	{
		var res = LS.RM.resources[ value ];
		if( !res )
			input.style.color = error_color;
		else if( res._modified )
			input.style.color = modified_color;
	}

	if( options.align && options.align == "right" )
		input.style.direction = "rtl";

	if( options.placeHolder )
		input.setAttribute( "placeHolder", options.placeHolder );
	else if(resource_classname)
		input.setAttribute( "placeHolder", resource_classname );

	input.addEventListener( "change", function(e) { 
		var v = e.target.value;
		if(v && v[0] != "@" && v[0] != ":" && !options.skip_load)
		{
			input.style.color = "#EA8"; //loading...
			LS.ResourcesManager.load(v, null, function(){
				input.style.color = ""; //loaded
			},false, function(){
				input.style.color = error_color; //loaded
			});
		}
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,v, options);
		if(v && !LS.RM.resources[ v ])
			input.style.color = error_color;
	});

	//INPUT ICON
	element.setIcon = function(img)
	{
		if(!img)
		{
			input.style.background = "";
			input.style.paddingLeft = "";
		}
		else
		{
			input.style.background = "transparent url('"+img+"') no-repeat left 4px center";
			input.style.paddingLeft = "1.7em";
		}
	}
	if(options.icon)
		element.setIcon( options.icon );
	else if ( InterfaceModule.resource_icons[ resource_classname ] )
		element.setIcon( InterfaceModule.resource_icons[ resource_classname ] );
	
	//BUTTON select resource
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 

		if(e.ctrlKey)
		{
			if(!input.value)
				return;
			var res = LS.RM.getResource( input.value );
			if(res)
				EditorModule.inspect(res);
			return;
		}

		var o = { type: resource_classname, on_complete: inner_onselect };
		if(options.skip_load)
			o.skip_load = true;
		else
			o.on_load = inner_onload;
		EditorModule.showSelectResource( o );

		if(options.callback_button)
			options.callback_button.call( element, input.value);
	});

	function inner_onselect(filename)
	{
		value = input.value = filename;
		LiteGUI.trigger( input, "change" );
	}

	function inner_onload( filename ) //shouldnt this be moved to the "change" event?
	{
		if(options.callback_load)
			options.callback_load.call( element, filename );
	}

	//element.setAttribute("draggable","true");
	element.addEventListener("dragover",function(e){ 
		var path = e.dataTransfer.getData( "res-fullpath" );
		var type = e.dataTransfer.getData( "res-type" );
		if(path) // && (type == "Texture" || type == "Image") )
			e.preventDefault();
	},true);
	element.addEventListener("drop", function(e){
		var path = e.dataTransfer.getData("res-fullpath");
		if(path)
		{
			value = input.value = path;
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}
		else if (e.dataTransfer.files.length)
		{
			ImporterModule.importFile( e.dataTransfer.files[0], function(fullpath){
				value = input.value = fullpath;
				LiteGUI.trigger( input, "change" );
			});
			e.stopPropagation();
		}
		else if (e.dataTransfer.getData("text/uri-list") )
		{
			value = input.value = e.dataTransfer.getData("text/uri-list");
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}
		e.preventDefault();
		return false;
	}, true);

	element.setValue = function(v,skip_event) { 
		input.value = value = v;
		if(!skip_event)
			LiteGUI.trigger(input, "change" );
	}
	element.getValue = function() { return value; }

	this.tab_index += 1;
	this.append(element, options);
	return element;
}

//to select a resource
LiteGUI.Inspector.prototype.addResource = function( name, value, options, resource_classname )
{
	return addGenericResource.call(this, name, value, options, resource_classname );
}

LiteGUI.Inspector.widget_constructors["resource"] = "addResource";

//to select a texture
LiteGUI.Inspector.prototype.addTexture = function( name, value, options )
{
	return addGenericResource.call(this, name, value, options, "Texture" );
}
LiteGUI.Inspector.widget_constructors["texture"] = "addTexture";

//to select a cubemap (texture)
LiteGUI.Inspector.prototype.addCubemap = LiteGUI.Inspector.prototype.addTexture;
LiteGUI.Inspector.widget_constructors["cubemap"] = "addCubemap";

LiteGUI.Inspector.prototype.addMesh = function(name,value, options)
{
	return addGenericResource.call(this, name, value, options, "Mesh" );
}

LiteGUI.Inspector.widget_constructors["mesh"] = "addMesh";

//to select a material
LiteGUI.Inspector.prototype.addMaterial = function( name,value, options)
{
	options = options || {};
	options.width = "70%";
	options.name_width = 70;

	this.widgets_per_row += 2;
	var r = addGenericResource.call(this, name, value, options, "Material" );
	this.addButton(null,"Edit",{ width:"20%", callback: function(){
		if(options.callback_edit)
			if( options.callback_edit.call( this ) )
				return;
		var path = r.getValue();
		var material = LS.RM.getResource( path );
		if(!material || !material.constructor.is_material)
			return;
		EditorModule.inspect( material, this.inspector );
	}});
	this.addButton(null,"<img src='imgs/mini-icon-trash.png'/>",{ width: "10%", callback: function(){
		r.setValue("");
	}});
	this.widgets_per_row -= 2;
	return r;
}
LiteGUI.Inspector.widget_constructors["material"] = "addMaterial";


//to select a script
LiteGUI.Inspector.prototype.addScript = function( name, value, options )
{
	options = options || {};

	if(!options.width)
		options.width = "100% - 30px";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Script" );
	this.addButton(null,"{}",{ width:"30px", callback: function(){

		if(options.callback_edit)
			if( options.callback_edit.call( this ) )
				return;
		var path = r.getValue();
		if(path && path.indexOf(".js") == -1)
			return;

		var script = LS.RM.getResource( path );
		if(!script)
		{
			DriveModule.showCreateScriptDialog({filename: "script.js", folder: DriveModule.getSceneBaseFolder() }, function(resource){
				if(!resource)
					return;
				CodingModule.openTab();
				var fullpath = resource.fullpath || resource.filename;
				if(options.callback)
					options.callback(fullpath);
				CodingModule.editInstanceCode( resource );
			});
			return;
		}
		//open script
		CodingModule.editInstanceCode( script, null, true );
	}});
	this.widgets_per_row -= 1;
	return r;
}
LiteGUI.Inspector.widget_constructors["script"] = "addScript";


//to select a graph
LiteGUI.Inspector.prototype.addGraph = function( name, value, options )
{
	options = options || {};
	var that = this;

	if(!options.width)
		options.width = "100% - 50px";
	options.icon = "imgs/mini-icon-graph.png";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Graph" );
	this.addButton(null,"New",{ width:"50px", callback: function(){
		if(options.callback_edit)
			if( options.callback_edit.call( this ) )
				return;
		var path = r.getValue();
		if(path && path.indexOf(".json") == -1)
			return;

		var graph = LS.RM.getResource( path );
		if(graph)
		{
			//GraphModule.editInstanceGraph( graph, null, true );
			return;
		}

		var default_filename = "";
		if (options.graph_type == LS.GraphCode.SHADER_GRAPH)
			default_filename = "shader.GRAPH.json";
		else
			default_filename = "graph.GRAPH.json";

		DriveModule.showSelectFolderFilenameDialog(null, function( folder, filename, fullpath ){
			//GraphModule.editInstanceGraph( resource );
			var graph = new LS.GraphCode();
			if(options.graph_type)
				graph.type = options.graph_type;
			LS.RM.registerResource( fullpath, graph );
			if(options.callback)
				options.callback( fullpath, graph );
			that.refresh();
		}, { button: "Create", filename: default_filename, folder: DriveModule.getSceneBaseFolder(), extension:"GRAPH.json" } );
		return;
	}});
	this.widgets_per_row -= 1;
	return r;
}
LiteGUI.Inspector.widget_constructors["graph"] = "addGraph";


//to select a material
LiteGUI.Inspector.prototype.addAnimation = function( name,value, options)
{
	options = options || {};
	options.width = "85%";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Animation" );
	this.addButton(null,"Edit",{ width:"15%", widget_parent: options.widget_parent, callback: function(){
		var path = r.getValue();
		var anim = null;
		if(!path)
		{
			path = "@scene";
			if(!LS.GlobalScene.animation)
				LS.GlobalScene.createAnimation();
			anim = LS.GlobalScene.animation;
		}
		else
			anim = LS.RM.getResource( path, LS.Animation );
		if(anim)
			AnimationModule.showTimeline( anim );
		else if(path != "@scene")
			LS.RM.load( path, null, function(v){ AnimationModule.showTimeline( v ); });
	}});
	this.widgets_per_row -= 1;
	return r;
}
LiteGUI.Inspector.widget_constructors["animation"] = "addAnimation";


//to select texture and sampling options
LiteGUI.Inspector.prototype.addTextureSampler = function(name, value, options)
{
	options = options || {};
	value = value || {};
	var that = this;
	this.values[name] = value;

	var tex_name = "";
	if(value.texture)
		tex_name = typeof( value.texture ) == "string" ? value.texture : ":Texture";
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+tex_name+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");
	input.value = (value && value.texture) ? value.texture : "";
	element.options = options;

	input.style.background = "transparent url('" + InterfaceModule.resource_icons.Texture +"') no-repeat left 4px center";
	input.style.paddingLeft = "1.7em";
	input.setAttribute("placeHolder","Texture");

	var callback = options.callback;

	options.callback = function(v)
	{
		input.value = (v && v.texture) ? v.texture : "";
		if(callback)
			callback.call(element, v);
	}

	input.addEventListener("change", function(e) { 
		var v = e.target.value;
		if(v && v[0] != ":" && !options.skip_load)
			LS.ResourcesManager.load( v );
		value.texture = v;
		LiteGUI.Inspector.onWidgetChange.call( that, element, name, value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener("click", function(e) { 
		EditorModule.showTextureSamplerInfo( value, options );
	});

	//element.setAttribute("draggable","true");
	element.addEventListener("dragover",function(e){ 
		var path = e.dataTransfer.getData("res-fullpath");
		var type = e.dataTransfer.getData( "res-type" );
		if(path) // && (type == "Texture" || type == "Image") )
			e.preventDefault();
	},true);
	element.addEventListener("drop", function(e){
		var path = e.dataTransfer.getData("res-fullpath");
		if(path)
		{
			input.value = path;
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}
		else if (e.dataTransfer.files.length)
		{
			ImporterModule.importFile( e.dataTransfer.files[0], function(fullpath){
				input.value = fullpath;
				LiteGUI.trigger( input, "change" );
			});
			e.stopPropagation();
		}
		else if (e.dataTransfer.getData("text/uri-list") )
		{
			input.value = e.dataTransfer.getData("text/uri-list");
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}

		e.preventDefault();
		return false;
	}, true);

	function inner_onselect( sampler )
	{
		input.value = sampler ? sampler.texture : "";
		if(sampler)
			sampler._must_update = true;
		LiteGUI.trigger( input, "change" );
	}

	this.tab_index += 1;
	this.append(element, options);
	return element;
}
LiteGUI.Inspector.widget_constructors["sampler"] = "addTextureSampler";

LiteGUI.Inspector.widget_constructors["position"] = "addVector3";

LiteGUI.Inspector.prototype.addLayers = function(name, value, options)
{
	options = options || {};
	var text = LS.GlobalScene.getLayerNames(value).join(",");

	options.callback_button = function() {
		EditorModule.showLayersEditor( value, function (layers,bit,v){
			value = layers;
			var text = LS.GlobalScene.getLayerNames(value).join(",");
			widget.setValue(text);
			if(options.callback)
				options.callback.call( widget, layers, bit, v );
		}, options.node );
	};

	var widget = this.addStringButton(name, text, options);
	return widget;
}
LiteGUI.Inspector.widget_constructors["layers"] = "addLayers";


LiteGUI.Inspector.prototype.addRenderSettings = function(name, value, options)
{
	options = options || {};

	options.callback = function(){
		EditorModule.showRenderSettingsDialog( value );
	};

	return this.addButton(name,"Edit", options );
}
LiteGUI.Inspector.widget_constructors["RenderSettings"] = "addRenderSettings";


LiteGUI.Inspector.prototype.addRenderFrameContext = function( name, value, options )
{
	options = options || {};

	options.callback = function(){
		EditorModule.showRenderFrameContextDialog(value);
	};

	return this.addButton(name,"Edit", options ); //the button could be small
}
LiteGUI.Inspector.widget_constructors["RenderFrameContext"] = "addRenderFrameContext";

LiteGUI.Inspector.prototype.addRenderState = function( name, value, options )
{
	options = options || {};

	options.callback = function(){
		EditorModule.showRenderStateDialog(value);
	};

	return this.addButton(name,"Edit", options ); //the button could be small
}
LiteGUI.Inspector.widget_constructors["RenderState"] = "addRenderState";

LiteGUI.Inspector.prototype.addShader = function( name, value, options )
{
	options = options || {};
	var inspector = this;

	options.width = "80%";
	options.resource_classname = "ShaderCode";

	inspector.widgets_per_row += 1;

	var widget = inspector.addResource( name, value, options );

	inspector.addButtons( null, [LiteGUI.special_codes.refresh, "{}"], { skip_wchange: true, width: "20%", callback: inner } );

	inspector.widgets_per_row -= 1;

	function inner(v)
	{
		if( v == LiteGUI.htmlEncode( LiteGUI.special_codes.refresh ) )
		{
			if(options.callback_refresh)
				options.callback_refresh.call( widget );//material.processShaderCode();
		}
		else if( v == "{}" )
		{
			//no shader, ask to create it
			if(!value)
			{
				inner_create_shader();
				return;
			}

			//edit shader
			var shader_code = LS.RM.resources[ value ];
			if(shader_code)
				CodingModule.editInstanceCode( shader_code, null, true );
			else
				LiteGUI.confirm("ShaderCode not found, do you want to create it?", function(v){
					if(v)
						inner_create_shader();
				});
		}

		function inner_create_shader()
		{
			DriveModule.showCreateShaderDialog({ filename: "my_shader.glsl", folder: DriveModule.getSceneBaseFolder(), on_complete: function( shader_code, filename, folder, fullpath ){
				if(options.callback_open)
					options.callback_open.call( widget, fullpath || filename );
				if(options.callback)
					options.callback.call( widget, fullpath || filename );
				CodingModule.editInstanceCode( shader_code, null, true );
			}});

			/*
			DriveModule.showSelectFolderFilenameDialog("my_shader.glsl", function(folder,filename,fullpath){
				var shader_code = new LS.ShaderCode();
				shader_code.code = LS.ShaderCode.examples.color;
				LS.RM.registerResource( fullpath, shader_code );
				if(options.callback_open)
					options.callback_open.call( widget, fullpath );
				if(options.callback)
					options.callback.call(widget, fullpath);
				CodingModule.editInstanceCode( shader_code, null, true );
			},{ extension:"glsl", allow_no_folder: true } );
			*/
		}

		inspector.refresh();
	}

	return widget;
}
LiteGUI.Inspector.widget_constructors["shader"] = "addShader";

//overwrite color widget to add the color picker
LiteGUI.Inspector.prototype.addColorOld = LiteGUI.Inspector.prototype.addColor;
LiteGUI.Inspector.prototype.addColor = function( name, value, options )
{
	options = options || {};
	var inspector = this;

	var total_width = 100 / this.widgets_per_row;
	var w = (total_width * 0.9);

	options.width = w + "%";

	inspector.widgets_per_row += 1;

	if(!options.name_width)
		options.name_width = "40%";

	var widget = inspector.addColorOld( name, value, options );
	var color_picker_icon = colorPickerTool.icon;

	inspector.addButton( null, "<img src="+color_picker_icon+">", { skip_wchange: true, width: (total_width - w) + "%", callback: inner } );

	inspector.widgets_per_row -= 1;

	function inner(v)
	{
		console.log("picker");
		colorPickerTool.oneClick( inner_color );
	}

	function inner_color(color)
	{
		if(!color)
			return;
		console.log(color);
		widget.setValue(color);
		RenderModule.requestFrame();
		//if(options.callback)
		//	options.callback( color );
	}

	return widget;
}
LiteGUI.Inspector.widget_constructors["color"] = "addColor";

