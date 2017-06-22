var CodingModule = //do not change
{
	name: "Code",
	bigicon: "imgs/tabicon-code.png",

	show_sceneview: true, //3d view
	show_panel: false, //side panel

	is_sceneview_visible: true, 

	APIs: {}, //here you can register function calls of the API
	windows: [], //external windows

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.name, {
			id:"codingtab",
			bigicon: this.bigicon,
			size: "full", 
			callback: function(tab) {
				CodingModule.show3DWindow( CodingModule.show_sceneview );
				CodingModule.showSidePanel( CodingModule.show_panel );
				CodingModule.coding_tabs_widget.refresh();
			},
			callback_canopen: function(){
				//avoid opening the tab if it is in another window
				if(CodingModule.external_window)
					return false;
			},
			callback_leave: function() {
				RenderModule.appendViewportTo(null);
				//CodingModule.assignCurrentCode();
			},
			module: this //used to catch keyboard events
		});

		this.root = LiteGUI.main_tabs.getTab(this.name).content;

		//tabs for every file
		//register some APIs used for autocompletion
		
		//this.registerAPI("glsl", ["uniform","varying","sampler2D","samplerCube"] );
		this.registerAPI("glsl", ["texture2D","textureCube","radians","degrees","sin","cos","tan","asin","acos","atan","pow","exp","log","exp2","length"] );
		this.registerAPI("glsl", ["IN.color","IN.vertex","IN.normal","IN.uv","IN.uv1","IN.camPos","IN.viewDir","IN.worldPos","IN.worldNormal","IN.screenPos"] );
		this.registerAPI("glsl", ["o.Albedo","o.Normal","o.Emission","o.Specular","o.Gloss","o.Alpha","o.Reflectivity"] );

		LiteGUI.menubar.add("Window/Coding Panel", { callback: function(){ CodingTabsWidget.createDialog(); }});
		LiteGUI.menubar.add("Actions/Catch Exceptions", { type: "checkbox", instance: LS, property: "catch_exceptions" });

		LiteGUI.menubar.add("Help/Coding/LS/Guides", {  callback: function(){ window.open("https://github.com/jagenjo/litescene.js/tree/master/guides#guide-to-develop-for-litescene","_blank"); }});
		LiteGUI.menubar.add("Help/Coding/LS/API", {  callback: function(){ window.open("http://webglstudio.org/doc/litescene/","_blank"); }});
		LiteGUI.menubar.add("Help/Coding/LiteGL/Guides", {  callback: function(){ window.open("https://github.com/jagenjo/litegl.js/tree/master/guides","_blank"); }});
		LiteGUI.menubar.add("Help/Coding/LiteGL/API", {  callback: function(){ window.open("http://webglstudio.org/doc/litegl/","_blank"); }});

		var coding_area = this.coding_area = new LiteGUI.Area({ id: "codearea", height: "100%"});
		this.root.appendChild( coding_area.root );
		coding_area.split("horizontal",[null,"50%"],true);

		var left_area = coding_area.getSection(0);
		left_area.split("vertical",[null,"25%"],true);

		this.coding_3D_area = left_area.getSection(0).content;
		this.console_area = left_area.getSection(1).content;

		//CONSOLE
		this.console_widget = new ConsoleWidget();
		this.console_area.appendChild( this.console_widget.root );

		//console._log = console.log;
		//console.log = this.onConsoleLog.bind(this);

		//CODING
		var coding_tabs_widget = this.coding_tabs_widget = new CodingTabsWidget();
		coding_tabs_widget.is_master_editor = true;
		coding_area.getSection(1).add( coding_tabs_widget );
		//coding_tabs_widget.onNewTab();

		LEvent.bind( LS, "code_error", this.onCodeError, this );

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
		if(open_tab)
			this.openTab();
		this.coding_tabs_widget.editInstanceCode( instance, options );
	},

	closeInstanceTab: function( instance, options )
	{
		return this.coding_tabs_widget.closeInstanceTab( instance, options );
	},

	//
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

	//used to extract editor options of a given instance
	extractOptionsFromInstance: function( instance, options )
	{
		if(!instance)
		{
			console.error("instance cannot be null");
			return;
		}

		options = options || {};

		//compute id
		var fullpath = instance.fullpath || instance.filename; //for resources
		var uid = instance.uid || instance.name; //for components
		var id = options.id || fullpath || uid;
		options.id = id;

		if(fullpath)
			fullpath = LS.RM.cleanFullpath(fullpath);

		//compute title
		var title = options.title;
		if(!title)
		{
			if(fullpath) //resources
				title = LS.RM.getFilename( fullpath );
			if(instance.getComponentTitle) //scripts
				title = instance.getComponentTitle();
		}
		options.title = title || "Script";

		//compute lang
		var lang = options.lang;
		if( !lang )
		{
			if( instance.constructor.is_material || instance.constructor == LS.ShaderCode ) 
				lang = "glsl";
			if( fullpath )
			{
				var ext = LS.RM.getExtension(fullpath);
				if( ext == "js" )
					lang = "javascript";
				else if( ext == "txt" )
					lang = "text";
				else
					lang = ext;
			}
		}
		options.lang = lang || "javascript";

		//compute type
		if(instance.constructor.is_resource)
			options.type = LS.TYPES.RESOURCE;
		else if(instance.constructor.is_component)
			options.type = LS.TYPES.COMPONENT;
		else if(instance.constructor.is_material)
			options.type = LS.TYPES.MATERIAL;

		return options;
	},

	//finds instance from options using id and type
	findInstance: function( options, callback )
	{
		var id = options.id;
		if(!id)
		{
			console.warn("findInstance options without id");
			return null;
		}

		//get instance from options
		if(options.type == LS.TYPES.RESOURCE)
		{
			if(LS.RM.resources[ id ])
				return LS.RM.resources[ id ];
			LS.RM.load( id, null, function(res){
				if(callback)
					callback( res, options );
			});
			return null;
		}
		else if(options.type == LS.TYPES.COMPONENT)
		{
			var comp = LS.GlobalScene.findComponentByUId( id );
			if(callback)
				callback( comp, options );
			return comp;
		}
		else
			console.warn("Cannot find code instance: ",id );
		return null;
	},

	showCodingHelp: function( options )
	{
		var help = options.help;
		if(!help)
		{
			if(options.type === LS.TYPES.COMPONENT)
			{
				window.open( "https://github.com/jagenjo/litescene.js/blob/master/guides/scripting.md"	);
			}
			else if(options.type === LS.TYPES.RESOURCE)
			{
				if(options.lang == "glsl")
				{
					if(LS.ShaderCode.help_url)
						window.open( LS.ShaderCode.help_url	);
					return;
					//help = LS.SurfaceMaterial.coding_help;
				}
				else
					window.open( "https://github.com/jagenjo/litescene.js/blob/master/guides/scripting.md"	);
			}
			else
				return;
		}

		var help_options = {
			content: "<pre style='padding:10px; height: 200px; overflow: auto'>" + help + "</pre>",
			title: "Help",
			draggable: true,
			closable: true,
			width: 400,
			height: 260
		};

		var dialog = new LiteGUI.Dialog("info_message",help_options);
		dialog.addButton("Close",{ close: true });
		dialog.show();
	},

	onCodeError: function( e,err )
	{
		//if it is an script of ours, open in code editor
		if(!err.script)
			return;

		var tab = this.coding_tabs_widget.editInstanceCode( err.script );
		if(!tab || !tab.pad)
			return;

		this.openTab();
		tab.pad.markError( err.line, err.msg );

		var msg = String(err.msg || err.message || err.error);

		var elem = InterfaceModule.setStatusBar("<span class='link'>Error in code: " + msg + "</span>", "error" );

		if(err.script)
			elem.querySelector(".link").addEventListener("click", function(e){
				CodingModule.editInstanceCode(err.script,null,true);
			});
	},

	//shows the side 3d window
	show3DWindow: function(v)
	{
		if(v === undefined)
			v = !this.is_sceneview_visible;
		this.is_sceneview_visible = v;
		this.show_sceneview = v;

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

	showSidePanel: function(v)
	{
		InterfaceModule.setSidePanelVisibility(v);
		this.show_panel = InterfaceModule.side_panel_visibility;

	},

	onKeyDown: function(e)
	{
		//this key event must be redirected when the 3D area is selected
		if( this._block_event )
			return;
		this._block_event = true;
		var coding = this.coding_tabs_widget.root.querySelector(".CodeMirror");
		if(coding)
			coding.dispatchEvent( new e.constructor( e.type, e ) );
		this._block_event = false;
	},

	onUnload: function()
	{
		if(this.external_window)
			this.external_window.close();
	},

	//get the current state
	getState: function()
	{
		return this.coding_tabs_widget.getState();
	},

	//get the current state
	setState: function(o)
	{
		return this.coding_tabs_widget.setState(o);
	},

	onConsoleLog: function(a,b)
	{
		console._log.apply( console, arguments );

		var elem = document.createElement("div");
		elem.className = "msg";
		a = String(a);
		if( a.indexOf("%c") != -1)
		{
			a = a.split("%c").join("");
			elem.setAttribute("style",b);
		}
		elem.innerText = a;
		this.console_container.appendChild( elem );
		this.console_container.scrollTop = 1000000;
		if( this.console_container.childNodes.length > 500 )
			this.console_container.removeChild( this.console_container.childNodes[0] );
	}
};

CORE.registerModule( CodingModule );

/* editors **************************************/

LS.Components.Script.prototype.getExtraTitleCode = LS.Components.ScriptFromFile.prototype.getExtraTitleCode = function()
{
	return "<span class='icon script-context-icon'><img src='" + EditorModule.icons_path + LS.Script.icon + "'/></span>";
}

LS.Components.Script["@inspector"] = function( component, inspector )
{
	var context_locator = component.getLocator() + "/context";
	var context = component.getContext();

	var icon = this.current_section.querySelector(".script-context-icon");
	icon.addEventListener("dragstart", function(event) { 
		event.dataTransfer.setData("uid", context_locator );
		event.dataTransfer.setData("locator", context_locator );
		event.dataTransfer.setData("type", "object");
		event.dataTransfer.setData("node_uid", component.root.uid);
		if( component.setDragData )
			component.setDragData( event );
	});

	inspector.addButton(null,"Edit Code", { callback: function() {
		CodingModule.openTab();
		var path = component.uid;
		CodingModule.editInstanceCode( component );
	}});

	if(context)
	{
		if(context.onInspector)
			context.onInspector( inspector );
		else
			this.showObjectFields( context, inspector );
	}
}

LS.Components.ScriptFromFile["@inspector"] = function( component, inspector )
{
	inspector.widgets_per_row = 2;
	inspector.addResource( "Filename", component.filename, { width: "75%", category: "Script", align:"right", callback: function(v) { 
		component.filename = v;
	}});

	inspector.addButton(null,"Edit Code", { width: "25%", callback: function() {
		var path = component.uid;
		if(!component.filename)
		{
			/*
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
				CodingModule.editInstanceCode( res );
			});
			*/
			DriveModule.showCreateScriptDialog({filename: "script.js"}, function(resource){
				if(!resource)
					return;
				CodingModule.openTab();
				var fullpath = resource.fullpath || resource.filename;
				component.filename = fullpath;
				CodingModule.editInstanceCode( resource );
			});
			return;
		}

		CodingModule.openTab();
		var res = LS.ResourcesManager.load( component.filename, null, function(res){
			CodingModule.editInstanceCode( res );
		});
	}});
	inspector.widgets_per_row = 1;

	var context = component.getContext();
	if(context)
	{
		if(context.onInspector)
			context.onInspector( inspector );
		else
			this.showObjectFields(context, inspector );
	}
}

LS.Components.Script.prototype.onComponentInfo = function( widgets )
{
	var component = this;

	var locator_widget = widgets.addString("Context Locator", this.getLocator() + "/context", { disabled: true } );

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

	//hardcoded
	if(!options.instance)
	{
		if(!options.name_width)
			options.name_width = "20%";
		element = this.createWidget(name,"<textarea style='min-height: 100px;background-color: black; font-style: Courier; color: #eee;' tabIndex='"+ this.tab_index + "'>"+(value||"")+"</textarea>", options);
		element.querySelector("textarea").addEventListener("change",function(e){
			var value = this.value;
			LiteGUI.Inspector.onWidgetChange.call( that, element, name, value, options );
		});
	}
	else if(!options.allow_inline)
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


LS.Components.Script.actions["breakpoint_on_call"] = { 
	title: "Breakpoint on call", 
	callback: function() { 
		if(!this._root)
		{
			console.warn("Script is not attached to a node?");
			return;
		}
		this._breakpoint_on_call = true;
	}
};



LS.Components.Script.actions["convert_to_script"] = { 
	title: "Convert to ScriptFromFile", 
	callback: function() { 
		if(!this._root)
		{
			console.warn("Script is not attached to a node?");
			return;
		}

		var node = this._root;
		var info = this.serialize();
		var code = this.getCode();
		delete info.code;
		var compo = this;

		LiteGUI.prompt("Choose a filename for the source file", function(v){

			var resource = new LS.Resource();
			resource.setData( code );
			LS.RM.registerResource( v, resource );
			info.filename = resource.filename;

			var index = node.getIndexOfComponent(compo);
			node.removeComponent(compo);

			var script = new LS.Components.ScriptFromFile();
			node.addComponent(script, index);
			script.configure(info);
			EditorModule.refreshAttributes();

			console.log("Script converted to ScriptFromFile");
		},{ value:"unnamed_code.js" });
	}
};

LS.Components.ScriptFromFile.actions = {}; //do not share with script
LS.Components.ScriptFromFile.actions["convert_to_script"] = { 
	title: "Convert to Script", 
	callback: function() { 
		if(!this._root)
		{
			console.warn("Script is not attached to a node?");
			return;
		}

		var node = this._root;
		var info = this.serialize();
		delete info.filename;
		info.code = this.getCode();
		var script = new LS.Components.Script();
		var index = node.getIndexOfComponent(this);
		node.removeComponent(this);
		node.addComponent(script, index);
		script.configure(info);
		EditorModule.refreshAttributes();
		console.log("ScriptFromFile converted to Script");
	}
};

LS.Components.ScriptFromFile.actions["breakpoint_on_call"] = LS.Components.Script.actions["breakpoint_on_call"];

//Example code for a shader (used in editor) **************************************************
LS.ShaderCode.examples = {};

LS.ShaderCode.examples.fx = "\n\
\\fx.fs\n\
	precision highp float;\n\
	\n\
	uniform float u_time;\n\
	uniform vec4 u_viewport;\n\
	uniform sampler2D u_texture;\n\
	varying vec2 v_coord;\n\
	void main() {\n\
		gl_FragColor = texture2D( u_texture, v_coord );\n\
	}\n\
";

LS.ShaderCode.examples.flat = "\n\
\n\
\\js\n\
\n\
\\color.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
uniform mat4 u_model;\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\color.fs\n\
\n\
precision mediump float;\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//material\n\
uniform vec4 u_material_color; //color and alpha\n\
void main() {\n\
	vec4 color = u_material_color;\n\
	gl_FragColor = color;\n\
}\n\
\n\
";

LS.ShaderCode.examples.textured = "\n\
\n\
\\js\n\
this.createSampler(\"Texture\",\"u_texture\");\n\
\n\
\\color.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
uniform mat4 u_model;\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\color.fs\n\
\n\
precision mediump float;\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
//globals\n\
uniform sampler2D u_texture;\n\
\n\
//material\n\
uniform vec4 u_material_color; //color and alpha\n\
void main() {\n\
	vec4 color = u_material_color * texture2D( u_texture, v_uvs );\n\
	gl_FragColor = color;\n\
}\n\
\n\
";


LS.ShaderCode.examples.fake_light = "\n\
\n\
\\js\n\
//define exported uniforms from the shader (name, uniform, widget)\n\
this.createUniform(\"Number\",\"u_number\",\"number\");\n\
this.createSampler(\"Texture\",\"u_texture\");\n\
\n\
\\color.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
uniform mat4 u_model;\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\color.fs\n\
\n\
precision mediump float;\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform float u_time;\n\
uniform vec3 u_background_color;\n\
uniform vec3 u_ambient_light;\n\
\n\
uniform float u_number;\n\
uniform sampler2D u_texture;\n\
\n\
//material\n\
uniform vec4 u_material_color; //color and alpha\n\
void main() {\n\
	vec3 N = normalize( v_normal );\n\
	vec3 L = vec3( 0.577, 0.577, 0.577 );\n\
	vec4 color = u_material_color;\n\
	color.xyz *= max(0.0, dot(N,L) );\n\
	gl_FragColor = color;\n\
}\n\
\n\
";

LS.ShaderCode.examples.light_and_deformers = "\n\
\n\
\n\
\\js\n\
//define exported uniforms from the shader (name, uniform, widget)\n\
this.createSampler(\"Texture\",\"u_texture\");\n\
this.createSampler(\"Spec. Texture\",\"u_specular_texture\");\n\
this.createSampler(\"Normal Texture\",\"u_normal_texture\");\n\
this._light_mode = 1;\n\
\n\
\\color.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
uniform mat4 u_model;\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
#pragma shaderblock \"light\"\n\
#pragma shaderblock \"morphing\"\n\
#pragma shaderblock \"skinning\"\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
  \n\
  //deforms\n\
  applyMorphing( vertex4, v_normal );\n\
  applySkinning( vertex4, v_normal );\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
  \n\
  applyLight(v_pos);\n\
  \n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\color.fs\n\
\n\
precision mediump float;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform float u_time;\n\
uniform vec3 u_background_color;\n\
uniform vec4 u_material_color;\n\
\n\
uniform sampler2D u_texture;\n\
uniform sampler2D u_specular_texture;\n\
uniform sampler2D u_normal_texture;\n\
\n\
#pragma shaderblock \"light\"\n\
\n\
#pragma snippet \"perturbNormal\"\n\
\n\
void main() {\n\
  Input IN = getInput();\n\
  SurfaceOutput o = getSurfaceOutput();\n\
  vec4 surface_color = texture2D( u_texture, IN.uv ) * u_material_color;\n\
  o.Albedo = surface_color.xyz;\n\
  vec4 spec = texture2D( u_specular_texture, IN.uv );\n\
	o.Specular = spec.x;  \n\
	o.Gloss = spec.y * 10.0;  \n\
	vec4 normal_pixel = texture2D( u_normal_texture, IN.uv );\n\
  o.Normal = perturbNormal( IN.worldNormal, IN.worldPos, v_uvs, normal_pixel.xyz );\n\
	  \n\
  vec4 final_color = vec4(0.0);\n\
  Light LIGHT = getLight();\n\
  final_color.xyz = computeLight( o, IN, LIGHT );\n\
  final_color.a = surface_color.a;\n\
  \n\
	gl_FragColor = final_color;\n\
}\n\
";


LS.ShaderCode.examples.skybox = "\n\
\n\
\\js\n\
//define exported uniforms from the shader (name, uniform, widget)\n\
this.createUniform(\"ground_color\",\"u_ground_color\",\"color\",[0.5,0.5,0.5]);\n\
this.render_state.cull_face = false;\n\
this.render_state.depth_test = false;\n\
this.flags.ignore_lights = true;\n\
this.flags.ignore_frustum = true;\n\
\n\
\\color.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
uniform mat4 u_model;\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\color.fs\n\
\n\
precision mediump float;\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform float u_time;\n\
uniform vec3 u_background_color;\n\
uniform vec3 u_ambient_light;\n\
\n\
//material\n\
uniform vec4 u_material_color; //color and alpha\n\
uniform vec3 u_ground_color; //color and alpha\n\
\n\
void main() {\n\
	vec3 N = normalize( v_normal );\n\
	vec4 color = u_material_color;\n\
	vec3 fog_color = vec3(1.0);\n\
	if(N.y < 0.0)\n\
		color.xyz = u_ground_color * (1.0 - abs(N.y));\n\
	else\n\
		color.xyz = mix( color.xyz, fog_color, 1.0 - N.y );\n\
	gl_FragColor = color;\n\
}\n\
\n\
";





LS.Script.templates.global = "//global scripts can have any kind of code.\n//They are used to define new classes (like materials and components) that are used in the scene.\n\n";
LS.Script.templates.component = "//https://github.com/jagenjo/litescene.js/blob/master/guides/programming_components.md\n\
//This is an example of a component code\n\
function MyComponentClass(o) {\n  //define some properties\n	this.someprop = 1;\n  //if we have the state passed, then we restore the state\n  if(o)\n    this.configure(o);\n}\n\n\
//bind events when the component belongs to the scene\nMyComponentClass.prototype.onAddedToScene = function(scene)\n{\n  LEvent.bind(scene, \"update\", this.onUpdate, this );\n}\n\n\
//unbind events when the component no longer belongs to the scene\nMyComponentClass.prototype.onRemovedFromScene = function(scene)\n{\n	//bind events\n  LEvent.unbind(scene, \"update\", this.onUpdate, this );\n}\n\n\
//example of one method called for ever update event\nMyComponentClass.prototype.onUpdate = function(e,dt)\n{\n  //do something\n  //...\n}\n\n\
//you can also implement the methods serialize and configure\n\n\
//register the class so it is a valid component for LS\n\nLS.registerComponent( MyComponentClass );\n";
