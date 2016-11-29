//This module is in charge of creating the application interface (menus, sidepanels, tabs, statusbar, etc)
var InterfaceModule = {
	name: "interface",

	preferences: { 
		show_low_panel: true,
		side_panel_width: 300
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

		var side_panel_width = this.preferences.side_panel_width || 300;

		//create a main container and split it in two (workarea: leftwork, sidebar)
		var mainarea = new LiteGUI.Area("mainarea",{content_id:"workarea", height: "calc(100% - 30px)", autoresize: true, inmediateResize: true, minSplitSize: 200 });
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

		//window.onbeforeunload = function() { return "You work will be lost."; };
	},

	createTabs: function()
	{
		var main_tabs = new LiteGUI.Tabs("worktabs", { width: "full", mode: "vertical", autoswitch: true });
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

		LiteGUI.bind( visorarea, "split_moved", function(e){
			InterfaceModule.lower_tabs_widget.onResize();
		});
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
		var lower_tabs_widget = new LiteGUI.Tabs("lowerpaneltabs", { size: "full" });
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
LiteGUI.Inspector.prototype.addNode = function( name, value, options )
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;

	var node_name = "";
	if( value && value.constructor == LS.SceneNode )
		node_name = value.name;
	else if(value && value.constructor == String)
	{
		node_name = value;
		value = LS.GlobalScene.getNode(node_name);
	}
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+node_name+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		if(options.use_node)
			value = LS.GlobalScene.getNode( e.target.value );
		else
			value = e.target.value;
		LiteGUI.Inspector.onWidgetChange.call(that, element, name, value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectNode( inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
	});

	element.addEventListener("drop", function(e){
		e.preventDefault();
		e.stopPropagation();
		var node_uid = e.dataTransfer.getData("node_uid");
		if(options.use_node)
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
		if(options.use_node)
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

	this.getValue = function() { return value; }

	this.tab_index += 1;
	this.append(element);
	return element;
}
LiteGUI.Inspector.widget_constructors["node"] = "addNode";

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
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
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

//To select any kind of resource
function addGenericResource ( name, value, options, resource_classname )
{
	options = options || {};
	value = value || "";
	var that = this;

	resource_classname = resource_classname || options.resource_classname;

	if(value.constructor !== String)
		value = "@Object";

	this.values[name] = value;

	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || LiteGUI.special_codes.open_folder )+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener( "change", function(e) { 
		var v = e.target.value;
		if(v && v[0] != ":" && !options.skip_load)
			LS.ResourcesManager.load(v);
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,v, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
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

	element.getValue = function() { return value; }

	this.tab_index += 1;
	this.append(element, options);
	return element;
}

//to select a resource
LiteGUI.Inspector.prototype.addResource = function( name, value, options )
{
	return addGenericResource.call(this, name, value, options );
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
	options.width = "85%";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Material" );
	this.addButton(null,"Edit",{ width:"15%", callback: function(){
		if(options.callback_edit)
			if( options.callback_edit.call( this ) )
				return;
		var path = r.getValue();
		var material = LS.RM.getResource( path );
		if(!material || !material.constructor.is_material)
			return;
		EditorModule.inspect( material, this.inspector );
	}});
	this.widgets_per_row -= 1;
	return r;
}
LiteGUI.Inspector.widget_constructors["material"] = "addMaterial";


//to select a script
LiteGUI.Inspector.prototype.addScript = function( name,value, options)
{
	options = options || {};
	options.width = "90%";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Script" );
	this.addButton(null,"{}",{ width:"10%", callback: function(){
		if(options.callback_edit)
			if( options.callback_edit.call( this ) )
				return;
		var path = r.getValue();
		var script = LS.RM.getResource( path );
		if(!script)
			return;
		//open script
		CodingModule.editInstanceCode( script, null, true );
	}});
	this.widgets_per_row -= 1;
	return r;
}
LiteGUI.Inspector.widget_constructors["script"] = "addScript";



//to select a material
LiteGUI.Inspector.prototype.addAnimation = function( name,value, options)
{
	options = options || {};
	options.width = "85%";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Animation" );
	this.addButton(null,"Edit",{ width:"15%", callback: function(){
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
		//$(element).find("input").val(filename).change();
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
		});
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

//to select a node, value must be a valid node identifier (not the node itself)
LiteGUI.Inspector.prototype.addComponent = function( name, value, options )
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
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectComponent( value, options.filter, options.callback, element );
		if(options.callback_button)
			options.callback_button.call(element, input.value );
	});

	element.addEventListener("drop", function(e){
		e.preventDefault();
		e.stopPropagation();
		var component_id = e.dataTransfer.getData("uid");
		input.value = component_id;
		LiteGUI.trigger( input, "change" );
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
LiteGUI.Inspector.widget_constructors["component"] = "addComponent";

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
			DriveModule.showCreateShaderDialog({ filename: "my_shader.glsl", on_complete: function(shader_code, filename, folder, fullpath ){
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

