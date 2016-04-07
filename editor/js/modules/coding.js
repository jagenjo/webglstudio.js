var CodingModule = //do not change
{
	name: "Code",
	bigicon: "imgs/tabicon-code.png",

	default_sceneview: true,
	sceneview_visible: true, //side panel

	APIs: {}, //here you can register function calls of the API
	windows: [], //external windows

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.name, {
			id:"codingtab",
			bigicon: this.bigicon,
			size: "full", 
			callback: function(tab) {

				/*
				if(CodingModule.editor)
					CodingModule.editor.refresh();
				*/
				if(!CodingModule.external_window)
					CodingModule.show3DWindow( CodingModule.default_sceneview );

				InterfaceModule.setSidePanelVisibility(false);
			},
			callback_canopen: function(){
				//avoid opening the tab if it is in another window
				if(CodingModule.external_window)
					return false;
			},
			callback_leave: function() {
				RenderModule.appendViewportTo(null);
				//CodingModule.assignCurrentCode();
		}});

		this.root = LiteGUI.main_tabs.getTab(this.name).content;

		//tabs for every file
		//register some APIs used for autocompletion
		
		//this.registerAPI("glsl", ["uniform","varying","sampler2D","samplerCube"] );
		this.registerAPI("glsl", ["texture2D","textureCube","radians","degrees","sin","cos","tan","asin","acos","atan","pow","exp","log","exp2","length"] );
		this.registerAPI("glsl", ["IN.color","IN.vertex","IN.normal","IN.uv","IN.uv1","IN.camPos","IN.viewDir","IN.worldPos","IN.worldNormal","IN.screenPos"] );
		this.registerAPI("glsl", ["o.Albedo","o.Normal","o.Emission","o.Specular","o.Gloss","o.Alpha","o.Reflectivity"] );

		LiteGUI.menubar.add("Window/Coding Panel", { callback: function(){ CodingTabsWidget.createDialog(); }});
		LiteGUI.menubar.add("Actions/Catch Exceptions", { type: "checkbox", instance: LS, property: "catch_exceptions" });

		var coding_area = this.coding_area = new LiteGUI.Area("codearea",{height: "100%"});
		this.root.appendChild( coding_area.root );
		coding_area.split("horizontal",[null,"50%"],true);
		this.coding_3D_area = coding_area.getSection(0).content;

		var coding_tabs_widget = this.coding_tabs_widget = new CodingTabsWidget();
		coding_area.getSection(1).add( coding_tabs_widget );
		//coding_tabs_widget.onNewTab();

		LS.catch_exceptions = true;
	},

	//registers a coding API (help, links to wiki, autocompletion, etc)
	registerAPI: function( lang, funcs )
	{
		var API = this.APIs[lang];
		if( !this.APIs[lang] )
			API = this.APIs[lang] = {};

		for(var i in funcs)
			API[ funcs[i] ] = true;
	},

	//open coding tab
	openTab: function()
	{
		LiteGUI.main_tabs.selectTab( this.name );
		this.show3DWindow( true );
	},

	//close coding tab ( back to scene view )
	closeTab: function()
	{
		LiteGUI.main_tabs.selectTab( RenderModule.name );
	},

	//switch coding tab
	editInstanceCode: function( instance, options, open_tab )
	{
		if(!instance)
			return;
		options = options || {};

		//is resource?
		var filename = instance.fullpath || instance.filename;

		if(!options.id && filename)
			options.id = filename;

		//compute lang
		if(!options.lang)
		{
			var lang = null;
			if(filename)
			{
				var ext = LS.RM.getExtension( filename );
				if( ext == "glsl" )
					lang = "glsl";
				else if( ext == "js" )
					lang = "javascript";
			}
			else
				lang = "";
			options.lang = lang;
		}

		if(open_tab)
			this.openTab();

		this.coding_tabs_widget.editInstanceCode( instance, options );
	},

	closeInstanceTab: function( instance, options )
	{
		return this.coding_tabs_widget.closeInstanceTab( instance, options );
	},

	onNewScript: function( node, type )
	{
		type = type || "Script";
		node = node || SelectionModule.getSelectedNode();
		if(!node)
			node = LS.GlobalScene.root;

		if(type == "Script")
		{
			var component = new LS.Components.Script();
			node.addComponent( component );
			this.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
			this.openTab();
		} 
		else if (type == "ScriptFromFile")
		{
			var component = new LS.Components.ScriptFromFile();
			node.addComponent( component );
		}
		else if (type == "Global")
		{
			LiteGUI.alert("TO DO");
		}
	},

	/*
	detachWindow: function()
	{
		var that = this;
		var main_window = window;

		if(!this.external_window)
		{
			this.show3DWindow(false);
			this.external_window = LiteGUI.main_tabs.detachTab( this.name, null, function(){
				that.external_window = null;
			});
		}
		else
		{
			this.external_window.close();
		}
	},

	createCodingWindow: function()
	{
		var extra_window = LiteGUI.newWindow("Code",800,600);
		this.windows.push( extra_window );
	},
	*/

	//shows the side 3d window
	show3DWindow: function(v)
	{
		this.sceneview_visible = v;
		if(v)
		{
			RenderModule.appendViewportTo( this.coding_area.sections[0].content );
			this.coding_area.showSection(0);
		}
		else
		{
			RenderModule.appendViewportTo(null);
			this.coding_area.hideSection(0);
		}
	},

	onUnload: function()
	{
		if(this.external_window)
			this.external_window.close();
	}

};

CORE.registerModule( CodingModule );

/* editors **************************************/

LS.Components.Script["@inspector"] = function(component, attributes)
{
	var context = component.getContext();

	attributes.widgets_per_row = 2;
	attributes.addString("Name", component.name, { pretitle: AnimationModule.getKeyframeCode( component, "context"), callback: function(v) { 
		component.name = v;
		LEvent.trigger( LS.Components.Script, "renamed", component );
		//CodingModule.onScriptRenamed( component );
	}});

	attributes.addButton(null,"Edit Code", { callback: function() {
		CodingModule.openTab();
		var path = component.uid;
		CodingModule.editInstanceCode(component, { id: component.uid, title: component._root.id, lang: "javascript", path: path, help: LS.Components.Script.coding_help } );
	}});
	attributes.widgets_per_row = 1;

	if(context)
		this.showObjectFields(context, attributes);
}

LS.Components.ScriptFromFile["@inspector"] = function(component, attributes)
{
	attributes.widgets_per_row = 2;
	attributes.addResource( "Filename", component.filename, { category: "Script", callback: function(v) { 
		component.filename = v;
	}});

	attributes.addButton(null,"Edit Code", { callback: function() {
		var path = component.uid;
		if(!component.filename)
		{
			LiteGUI.prompt("Choose a filename", function(filename){
				if(!filename)
					return;
				CodingModule.openTab();
				var res = new LS.Resource();
				var extension = LS.RM.getExtension(filename);
				if(extension != "js")
					filename = filename + ".js";
				component.filename = filename;
				LS.RM.registerResource(filename,res);
				CodingModule.editInstanceCode( res, { id: res.filename, title: filename, lang: "javascript", help: LS.Components.Script.coding_help,
					setCode: function(c) { res.setData(c); } //to force reload
				});
			});
			return;
		}

		CodingModule.openTab();
		var res = LS.ResourcesManager.load( component.filename, null, function(res){
			CodingModule.editInstanceCode( res, { id: component.filename, title: component.filename, lang: "javascript", path: path, help: LS.Components.Script.coding_help,
				setCode: function(c) { component.setCode(c); }	//to force reload
			});
		});
	}});
	attributes.widgets_per_row = 1;

	var context = component.getContext();
	if(context)
		this.showObjectFields(context, attributes);
}

LS.Components.Script.prototype.onComponentInfo = function( widgets )
{
	var component = this;

	var locator_widget = widgets.addString("Context Locator", this.getLocator() + "/context", { disabled: true } );
	/*
	locator_widget.style.cursor = "pointer";
	locator_widget.setAttribute("draggable","true");
	locator_widget.addEventListener("dragstart", function(event) { 
		event.dataTransfer.setData("locator", component.getContext().getLocator() );
		event.dataTransfer.setData("type", "property");
		event.dataTransfer.setData("node_uid", component.root.uid);
	});
	*/

	var values = [""];
	var context = this.getContext();
	if(context)
	{
		for(var i in context)
		{
			var f = context[i];
			if( typeof(f) != "function")
				continue;
			values.push(i);
		}
		widgets.addCombo("Functions", "", { values: values, callback: function(v){ 
			//TODO
		}});
	}
}

//to write a tiny code snippet
LiteGUI.Inspector.prototype.addCode = function( name, value, options )
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;

	var element = null;

	var instance = options.instance || {};
	var uid = instance.uid || ("code_" + this.tab_index);
	var instance_settings = { 
		id: uid,
		path: instance.uid,
		title: uid
	};
	//getCode: function(){ return instance[name];},
	//setCode: function(v){ instance[name] = v;}

	if(!options.allow_inline)
	{
		var text = "Edit Code";
		element = this.createWidget(name,"<button class='single' tabIndex='"+ this.tab_index + "'>"+text+"</button>", options);
		var button = element.querySelector("button");
		button.addEventListener("click", function() {
			CodingModule.openTab();
			CodingModule.editInstanceCode( instance, instance_settings );
		});
	}
	else
	{
		element = inspector.addContainer( null, { height: 300} );

		var codepad = new CodingPadWidget();
		element.appendChild( codepad.root );
		codepad.editInstanceCode( instance, instance_settings );
		codepad.top_widgets.addButton(null,"In Editor",{ callback: function() { 
			if(options.callback_button)
				options.callback_button();
			inspector.refresh();
			CodingModule.openTab();
			CodingModule.editInstanceCode( instance, instance_settings );
		}});
	}

	this.tab_index += 1;
	this.append( element );
	return element;
}

LiteGUI.Inspector.widget_constructors["code"] = "addCode";
