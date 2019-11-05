/* This module handles the tools to edit the scene */

var EditorModule = { 
	name: "editor",
	icons_path:  "imgs/",

	//to call when editing a node
	node_editors: [],
	material_editors: {},

	selected_data: null, //the extra info about this item selected (which component, which field, etc)

	preferences_panel: [ {name:"editor", title:"Editor", icon:null } ],
	preferences: { //persistent preferences
		autoselect: false,
		autofocus: true,
		save_on_exit: false,
		reload_on_start: true
	},

	commands: {},
	canvas_widgets: {},

	init: function()
	{
		//console.log("EditorModule init");
		RenderModule.canvas_manager.addWidget(this);

		if(!gl) 
			return;

		this.createMenuEntries();

		var scene = LS.GlobalScene;

		LEvent.bind( scene, "node_clicked", function(e, node) { 
			if( !window.PlayModule || !PlayModule.inplayer )
				EditorModule.inspect( node );
		});
		
		SelectionModule.setSelection( scene.root );

		var scene = localStorage.getItem("_refresh_scene");
		if(scene)
			setTimeout(function(){ 
				SceneStorageModule.setSceneFromJSON(scene); 
				localStorage.removeItem("_refresh_scene");
			},1000);
		else
		{
			this.resetScene();
		}

		EditorModule.refreshAttributes();

		this.registerCommands();
	},

	resetScene: function()
	{
		//set default scene
		LS.GlobalScene.clear();
		LS.GlobalScene.root.addComponent( new LS.Components.Skybox() );
	},

	registerCommands: function()
	{
		this.commands["set"] = this.setPropertyValueToSelectedNode.bind(this);
		this.commands["create"] = function( cmd, tokens )
		{
			var that = EditorModule;
			switch(tokens[1])
			{
				case "node": that.createNullNode(); break;
				case "light": that.createLightNode(); break;
				case "plane": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.PLANE, size: 10, subdivisions: 2 },"plane"); break;
				case "quad": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.QUAD, size: 10, subdivisions: 2 },"quad"); break;
				case "cube": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.CUBE, size: 10, subdivisions: 10 },"cube"); break;
				case "sphere": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 },"sphere"); break;
				case "cylinder": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.CYLINDER, size: 10, subdivisions: 32 },"cylinder"); break;
				default: break;
			}
		}
		this.commands["addComponent"] = function( cmd, tokens) { 
			EditorModule.addComponentToNode( SelectionModule.getSelectedNode(), tokens[1] );
			EditorModule.inspect( LS.GlobalScene.selected_node );
		};
		this.commands["selectNode"] = function( cmd, tokens) { 
			var node = LS.GlobalScene.getNode( tokens[1] );
			SelectionModule.setSelection( node );
		};
		this.commands["lights"] = function( cmd, tokens) { 
			var lights = LS.GlobalScene._lights;
			if(!lights)
				return;
			EditorModule.inspectObjects( lights );
		};
		this.commands["cameras"] = function( cmd, tokens) { 
			var cameras = RenderModule.cameras;
			if(!cameras)
				return;
			EditorModule.inspectObjects(cameras);
		};
		this.commands["components"] = function(cmd, tokens) { 
			var components = LS.GlobalScene.findNodeComponents( tokens[1] );
			if(!components)
				return;
			if(!components.length)
				return;
			EditorModule.inspectObjects( components );
		};
		this.commands["focus"] = function() {
			EditorModule.focusCameraInSelection();
		};
		this.commands["frame"] = function() {
			EditorModule.focusCameraInAll();
		};
		this.commands["upgrade_materials"] = function() {
			EditorModule.upgradeMaterials();
		};
	},

	registerCanvasWidget: function( widget_class )
	{
		this.canvas_widgets[ LS.getClassName( widget_class	) ] = widget_class;
	},

	createMenuEntries: function()
	{
		var mainmenu = LiteGUI.menubar;
		//buttons

		mainmenu.add("Scene/Settings", { callback: function() { 
			EditorModule.inspect( LS.GlobalScene ); 
		}});

		mainmenu.separator("Edit");

		mainmenu.add("Edit/Copy Node", { callback: function() { EditorModule.copyNodeToClipboard( SelectionModule.getSelectedNode() ); }});
		mainmenu.add("Edit/Paste Node", { callback: function() { EditorModule.pasteNodeFromClipboard(); }});
		mainmenu.add("Edit/Clone Node", { callback: function() { EditorModule.cloneNode( SelectionModule.getSelectedNode() ); }});
		mainmenu.add("Edit/Delete Node", { callback: function() { EditorModule.removeSelectedNodes(); }});
		mainmenu.add("Edit/Focus on node", { callback: function() { cameraTool.setFocusPointOnNode( SelectionModule.getSelectedNode(), true ); }});
		mainmenu.add("Edit/Paste component", { callback: function() { EditorModule.pasteComponentInNode( SelectionModule.getSelectedNode() ); }});

		mainmenu.add("Node/Create node", { callback: function() { EditorModule.createNullNode(); }});
		mainmenu.add("Node/Create camera", { callback: function() { EditorModule.createCameraNode(); }});
		mainmenu.add("Node/Create light", { callback: function() { EditorModule.createLightNode(); }} );
		//mainmenu.separator("Node");
		mainmenu.add("Node/Primitive/Plane", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.PLANE, size: 10, subdivisions: 10 }); }});
		mainmenu.add("Node/Primitive/Quad", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.QUAD, size: 10, subdivisions: 10 }); }});
		mainmenu.add("Node/Primitive/Cube", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.CUBE, size: 10, subdivisions: 10 }); }});
		mainmenu.add("Node/Primitive/Sphere", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Primitive/Cylinder", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.CYLINDER, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Primitive/Hemisphere", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.HEMISPHERE, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Templates/Sprite", { callback: function() { EditorModule.createTemplate("Sprite",[{ component: "Sprite" }]); }});
		mainmenu.add("Node/Templates/ParticleEmissor", { callback: function() { EditorModule.createTemplate("Particles",[{ component: "ParticleEmissor" }]); }});
		mainmenu.add("Node/Templates/MeshRenderer", { callback: function() { EditorModule.createTemplate("Mesh",[{ component: "MeshRenderer" }]); }});

		mainmenu.add("Node/Add Component", { callback: function() { EditorModule.showAddComponentToNode(null, function(){ EditorModule.refreshAttributes(); } ); }} );
		mainmenu.add("Node/Add Material", { callback: function() { EditorModule.showAddMaterialToNode( null, function(){ EditorModule.refreshAttributes(); }); }} );
		mainmenu.add("Node/Add Script", { callback: function() { 
			CodingModule.onNewScript(); 
			EditorModule.refreshAttributes();
		}});
		mainmenu.add("Node/Create from JSON", { callback: function() { EditorModule.showCreateFromJSONDialog(); }} );
		mainmenu.add("Node/Check JSON", { callback: function() { EditorModule.checkJSON( SelectionModule.getSelectedNode() ); }} );

		//mainmenu.add("View/Default material properties", { callback: function() { EditorModule.inspectInDialog( LS.Renderer.default_material ); }});
		mainmenu.add("View/Layers", { callback: function() { EditorModule.showLayersEditor(); }});

		mainmenu.add("Actions/Reload Shaders", { callback: function() { 
			LS.ShadersManager.reloadShaders(function() { RenderModule.requestFrame(); }); 
		}});

		//mainmenu.separator("Project", 100);
		//mainmenu.add("Project/Reset", { order: 101, callback: this.showResetDialog.bind(this) });

		function inner_change_renderMode(v) { RenderModule.setRenderMode(v.value); }
		function inner_is_renderMode(v) { 
			return (RenderModule.render_mode == v.value);
		}
		function inner_is_systemMode(v) { 
			return (EditorModule.coordinates_system == v.value);
		}

		mainmenu.add("View/Show All Gizmos", {  instance: EditorModule.preferences, property: "render_all_gizmos", type:"checkbox" });

		mainmenu.add("View/Render Settings", { callback: function() { EditorModule.showRenderSettingsDialog( RenderModule.render_settings) }} );

		mainmenu.add("View/Render Mode/Wireframe", {  value: "wireframe", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Flat", {  value: "flat", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Solid", { value: "solid", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Texture", { value: "texture", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Full", { value: "full", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		//mainmenu.add("View/Render Mode/Stencil", { value: "stencil", isChecked: inner_is_renderMode, callback: inner_change_renderMode });

		/*
		mainmenu.add("Edit/Coordinates/Object", { value: "object", isChecked: inner_is_systemMode, callback: function() { EditorModule.coordinates_system = 'object'; RenderModule.requestFrame(); }});
		mainmenu.add("Edit/Coordinates/World", { value: "world", isChecked: inner_is_systemMode, callback: function() { EditorModule.coordinates_system = 'world'; RenderModule.requestFrame(); }});
		mainmenu.add("Edit/Coordinates/View", { value: "view", isChecked: inner_is_systemMode, callback: function() { EditorModule.coordinates_system = 'view'; RenderModule.requestFrame(); }});
		*/
	},

	registerNodeEditor: function(callback)
	{
		this.node_editors.push(callback);
	},

	registerMaterialEditor: function(classname, callback)
	{
		this.material_editors[classname] = callback;
	},

	refreshAttributes: function()
	{
		if(!this.inspector.instance)
			return;
		this.inspect(this.inspector.instance);
	},

	updateInspector: function( object )
	{
		this.inspector.update( object );
	},

	inspect: function( objects, inspector )
	{
		if(inspector)
		{
			if(inspector.constructor === InspectorWidget)
				return inspector.inspect( objects );
			if(inspector.inspector_widget)
				return inspector.inspector_widget.inspect( objects );
		}
		else
			return this.inspector.inspect( objects );
	},

	inspectObjects: function( objects, inspector )
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( objects, inspector );
	},

	inspectObject: function(object, inspector)
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( object, inspector );
	},

	inspectScene: function(scene, inspector)
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( scene, inspector );
	},

	inspectNode: function(node, inspector)
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( node, inspector );
	},

	inspectInDialog: function( object )
	{
		if(!object)
			return;

		var classname = LS.getObjectClassName(object);
		var title = classname;

		var uid = object.uid || object.name;
		var id = "dialog_inspector_" + uid;
		var dialog = document.getElementById( "dialog_inspector_" + id );
		if(dialog) //already open
		{
			//bring to front?
			return;
		}

		var height = (InterfaceModule.visorarea.root.offsetHeight * 0.8)|0;

		var dialog = new LiteGUI.Dialog( { id: id, title: title, close: true, minimize: true, width: 300, height: height, detachable:true, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');
		dialog.setPosition(50 + (Math.random() * 10)|0,50 + (Math.random() * 10)|0);
		dialog.on_close = function()
		{
		}

		var inspector_widget = new InspectorWidget();
		var inspector = inspector_widget.inspector;
		inspector_widget.inspector.on_refresh = function()
		{
			inspector_widget.inspect( object );
			//dialog.adjustSize();
		}

		inspector_widget.inspector.refresh();
		dialog.add( inspector_widget );
		//dialog.adjustSize();
		return dialog;
	},

	getInspectedInstance: function()
	{
		return this.inspector.instance;
	},

	//given a code it shows in a tab
	checkCode: function( code, tabtitle )
	{
		if(!code)
			return;
		tabtitle = tabtitle || "Code";
		console.log(code); //helps navigating
		code = LiteGUI.htmlEncode( code ); //otherwise < is probleamtic
		var w = window.open("",'_blank');
		w.document.write("<style>* { margin: 0; padding: 0; } html,body { margin: 20px; background-color: #222; color: #ddd; } </style>");
		var str = beautifyCode( code );
		w.document.write("<pre>"+str+"</pre>");
		w.document.close();
		w.document.title = tabtitle;
		return w;
	},

	//given a string or object of a JSON, it opens a popup with the code beautified
	checkJSON: function( object )
	{
		if(!object)
			return;
		if(object.constructor === String)
			object = JSON.parse(object); //transform to object so we can use the propper stringify function
		var data = JSON.stringify( object.serialize ? object.serialize() : object, null, '\t');
		return this.checkCode(data);
	},

	showAddPropertyDialog: function( callback, valid_fields )
	{
		valid_fields = valid_fields || ["string","number","vec2","vec3","vec4","color","texture","node"];

		var uid = Math.random().toString();
		var id = "dialog_inspector_properties";
		var dialog = document.getElementById( "dialog_inspector_" + uid );

		var dialog = new LiteGUI.Dialog( { id: id, title: "Properties", parent:"#visor", close: true, minimize: true, width: 300, height: 200, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');

		var property = { name: "myVar", type: "number", value: 0, step: 0.1 };
		var value_widget = null;

		var inspector = new LiteGUI.Inspector();
		inspector.on_refresh = inner_refresh;
		inner_refresh();

		function inner_refresh()
		{
			inspector.clear();


			inspector.addString("Name", property.name, { callback: function(v){ property.name = v; } });
			inspector.addString("Label", property.label, { callback: function(v){ property.label = v; } });
			inspector.addCombo("Type", property.type, { values: valid_fields, callback: function(v){ 
				property.type = v;
				inspector.refresh();
			}});

			switch(property.type)
			{
				case "number":
					value = 0.0;
					value_widget = inspector.addNumber("Value", value, { callback: function(v){ property.value = v; }});
					break;
				case "vec2":
					value = vec2.fromValues(0,0);
					value_widget = inspector.addVector2("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; }});
					break;
				case "vec3":
					value = vec3.fromValues(0,0,0);
					value_widget = inspector.addVector3("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
					break;
				case "vec4":
					value = vec4.fromValues(0,0,0);
					value_widget = inspector.addVector4("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; property.value[3] = v[3]; }});
					break;
				case "color":
					value = vec3.fromValues(0,0,0);
					value_widget = inspector.addColor("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
					break;
				default:
					value = "";
					value_widget = inspector.add( property.type, "Value", value, { callback: function(v){ property.value = v; }});
			}
			property.value = value;

			if(property.type == "number" || property.type == "vec2" || property.type == "vec3")
			{
				inspector.addNumber("Step", property.step, { callback: function(v){ property.step = v; }});
			}

			inspector.addButton(null,"Create",{ callback: function() {
				if(callback)
					callback(property);
				dialog.close();
			}});
		}

		dialog.add( inspector );
		dialog.adjustSize();
	},

	showEditPropertiesDialog: function( properties, valid_fields, callback, parent )
	{
		valid_fields = valid_fields || ["string","number","vec2","vec3","vec4","texture","enum"];
		var selected = null;
		var properties_by_name = {};

		var dialog = new LiteGUI.Dialog( { title: "Edit Properties", parent: parent, close: true, minimize: true, width: 600, height: 300, resizable:true, draggable: true } );
		dialog.show();
		dialog.on_close = function(){
			if(callback)
				callback(properties);
		}

		//list
		var area = new LiteGUI.Area();
		area.split( "horizontal",["50%",null]);
		dialog.add( area );

		//properties inspector
		var inspector_left = new LiteGUI.Inspector();
		area.getSection(0).add( inspector_left );

		inspector_left.addTitle("Current properties");
		var list_widget = inspector_left.addList(null,properties,{height:230, callback: function(v){
			selected = v.name;					
			inner_update_properties();
		}});
		inspector_left.addButton(null,["Create property"],{ callback: function(v){
			if(v == "Create property")
			{
				LiteGUI.prompt("Name of property",function(v){
					if(!v)
						return;
					//check if there is a property with the same name
					if( properties_by_name[v] )
						return LiteGUI.alert("There is another var with the same name.");
					//check valid name
					if(!EditorModule.isValidVarName(v))
						return LiteGUI.alert("Not a valid name for a var.");
					//add
					var prop = { name: v, type: "number", value: 0, step: 0.1 };
					properties.push( prop );
					list_widget.setValue( properties );
					selected = prop.name;
					inner_update_properties();
					EditorModule.refreshAttributes();
				});			
			}
		}});


		//properties inspector
		var inspector = new LiteGUI.Inspector();
		area.getSection(1).add( inspector );

		var value_widget = null;
		inner_update_properties();

		function inner_update_properties()
		{
			//update list
			properties_by_name = {};
			for(var i in properties)
			{
				//if(!selected)
				//	selected = properties[i].name;
				properties_by_name[ properties[i].name ] = properties[i];
			}

			inspector.clear();
			inspector.addTitle("Property");

			var property = properties_by_name[ selected ];
			if(!property)
				return;	

			inspector.addString("Name", property.name, { callback: function(v) { 
				if(!v)
					return;
				if( properties_by_name[v] )
					return LiteGUI.alert("There is another var with the same name.");
				//check valid name
				if(!EditorModule.isValidVarName(v))
					return LiteGUI.alert("Not a valid name for a var.");
				property.name = v;
				selected = v;
				list_widget.setValue( properties );
				inner_update_properties();
				EditorModule.refreshAttributes();
			}});


			inspector.addString("Label", property.label || "", { callback: function(v) { 
				property.label = v;
			}});

			inspector.addCombo("Type", property.type, { values: valid_fields, callback: function(v) {
				var change = false;
				if(v != property.type)
				{
					property.type = v;
					change = true;
				}

				inner_value_widget( property, change );
				inner_update_properties();
				EditorModule.refreshAttributes();
			}});

			var valid_widgets = null;
			if( property.type == "number" )
				valid_widgets = ["number","slider"];
			else if( property.type == "vec3")
				valid_widgets = ["vec3","color"];
			else if( property.type == "vec4")
				valid_widgets = ["vec4","color"];

			if(valid_widgets)
			inspector.addCombo("Widget", property.widget || "", { values: valid_widgets, callback: function(v) {
				var change = false;
				property.widget = v;
				inner_value_widget( property, change );
				inner_update_properties();
				EditorModule.refreshAttributes();
			}});

			//value_widget = inspector.addNumber("Value", property.value, { step: property.step, callback: function(v){ property.value = v; }});
			inner_value_widget(property);

			if( property.type == "number" )
				inspector.addNumber("Step", property.step, { callback: function(v){ property.step = v; }});

			/*
			inspector.addButton(null,"Delete",{ callback: function() {
				for(var i = 0; i < properties.length; ++i)
				{
					if( properties[i] != property )
						continue;
					properties.splice(i,1);
					break;
				}
				EditorModule.refreshAttributes();
				selected = null;
				list_widget.setValue( properties );
				inner_update_properties();
			}});
			*/
			inspector.addButton(null,"Close",{ callback: function() {
				dialog.close();
			}});

			if(callback)
				callback(properties);
		}

		function inner_value_widget(property, change)
		{
			var type = property.widget || property.type;

			if(type == "number")
			{
				if(change) property.value = 0.0;
				inspector.addNumber("Value", property.value, { step: property.step, callback: function(v){ property.value = v; }});
			}
			else if(type == "vec2")
			{
				if(change) property.value = vec2.fromValues(0,0);
				inspector.addVector2("Value", property.value, { step: property.step, callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; }});
			}
			else if(type == "vec3")
			{
				if(change) property.value = vec3.fromValues(0,0,0);
				inspector.addVector3("Value", property.value, { step: property.step, callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
			}
			else if(type == "color")
			{
				if(change) property.value = vec3.fromValues(0,0,0);
				inspector.addColor("Value", property.value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
			}
			else if(type == "enum")
			{
				if(change)
				{
					property.value = "";
					property.values = [];
				}
				inspector.addString("Options", property.values, { callback: function(v){ 
					if(!v)
						return;
					var values = v.split(",");
					property.values = values;
					inner_update_properties();
				}});
				inspector.addCombo("Value", property.value, { values: property.values, callback: function(v){ property.value = v; }});
			}
			else
			{
				if(change) property.value = "";
				value_widget = inspector.add(property.type, "Value", property.value, { callback: function(v){ property.value = v; }});
			}
		}
	},

	isValidVarName: function() {
		var validName = /^[$A-Z_][0-9A-Z_$]*$/i;
		var reserved_array = ["instanceof","typeof","break","do","new","var","case","else","return","void","catch","finally","continue","for","switch","while","this","with","debugger","function","throw","default","if","try","delete","in"];
		var reserved = {}
		for(var i in reserved_array)
			reserved[ reserved_array[i] ] = true;
		return function(s) {
		// Ensure a valid name and not reserved.
			return validName.test(s) && !reserved[s];
		};
	}(),

	showResetDialog: function()
	{
		LiteGUI.confirm("Are you sure?", function(v) {
			if(v)
				EditorModule.resetEditor();
		});
	},	

	showNodeInfo: function( node )
	{
		var dialog = new LiteGUI.Dialog({ id: "node_info", title:"Node Info", width: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Name", node.name, function(v){ node.name = v; });
		widgets.addString("UID", node.uid, function(v){ node.uid = v; });
		widgets.addCheckbox("Visible", node.visible, function(v){ node.flags.visible = v; });

		var events = {};
		if(node.__levents)
			for(var i in node.__levents)
				events[ i ] = node.__levents[i];
		widgets.addCombo("Binded Events",null,{ values: events, callback: function(v){
			console.log(v);
		}});

		widgets.addSeparator();

		widgets.addButtons(null,["Show JSON","Close"], function(v){
			if(v == "Show JSON")
				EditorModule.checkJSON( node );
			else if(v == "Close")
				dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();
	},

	showLayersEditor: function( layers, callback, node )
	{
		var scene = LS.GlobalScene;

		var dialog = new LiteGUI.Dialog({ id: "layers_editor", title:"Layers editor", width: 300, height: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();

		var container = widgets.startContainer();
		container.style.height = "300px";
		container.style.overflow = "auto";

		if(layers !== undefined)
			widgets.widgets_per_row = 2;

		for(var i = 0; i < 32; ++i)
		{
			widgets.addString(null, scene.layer_names[i] || ("layer"+i), { layer: i, width: layers !== undefined ? "80%" : null, callback: function(v) {
				scene.layer_names[ this.options.layer ] = v;
			}});

			if(layers !== undefined)
				widgets.addCheckbox( null, 1<<i & layers, { layer: i, width: "20%", callback: function(v){
					var bit = this.options.layer;
					var f = 1<<bit;
					layers = (layers & (~f));
					if(v)
						layers |= f;
					if(callback)
						callback(layers,bit,v);
				}});
		}

		widgets.widgets_per_row = 1;
		widgets.endContainer();

		if(node)
			widgets.addButton("Apply Layers to children","Apply", { name_width: 200, callback:function(v){
				var nodes = node.getDescendants();
				for(var i = 0; i < nodes.length; ++i)
					nodes[i].layers = layers;
			}});

		widgets.addButtons(null,["Close"], function(v){
			if(v == "Close")
				dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();
		dialog.center();
	},

	showComponentInfo: function( component )
	{
		var dialog = new LiteGUI.Dialog({ id: "component_info", title:"Component Info", width: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector({name_width: 120});
		widgets.addString("Class", LS.getObjectClassName(component), { disabled: true } );
		if(component.enabled !== undefined)
			widgets.addCheckbox("Enabled", component.enabled, function(v){ component.enabled = v; });
		widgets.addString("UID", component.uid, function(v){ component.uid = v; });
		var locator_widget = widgets.addString("Locator", component.getLocator(), { disabled: true } );
		/*
		locator_widget.style.cursor = "pointer";
		locator_widget.setAttribute("draggable","true");
		locator_widget.addEventListener("dragstart", function(event) { 
			event.dataTransfer.setData("uid", component.uid );
			event.dataTransfer.setData("locator", component.getLocator() );
			event.dataTransfer.setData("type", "Component");
			if(component.root)
				event.dataTransfer.setData("node_uid", component.root.uid);
			event.preventDefault();
		});
		*/

		if( component.onComponentInfo )
			component.onComponentInfo( widgets );

		var events = {};
		if(component.__levents)
			for(var i in component.__levents)
				events[ i ] = component.__levents[i];
		widgets.addCombo("Binded Events",null,{ values: events, callback: function(v){
			console.log(v);
		}});

		var vars = [];
		for(var i in component)
			if( component[i] != null && !component[i].call )
				vars.push(i);
		widgets.addCombo("Properties",null,{ values: vars, callback: function(v){
			console.log( v, component[v] );
		}});

		widgets.addSeparator();

		widgets.addButtons(null,["Show JSON","Copy Component","Close"], function(v){
			if(v == "Show JSON")
				EditorModule.checkJSON( component );
			else if(v == "Close")
				dialog.close();
			else if(v == "Copy")
				EditorModule.copyComponentToClipboard( component );
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();
	},

	showRenderSettingsDialog: function( render_settings )
	{
		var dialog = new LiteGUI.Dialog( { title:"Render Settings", width: 400, draggable: true, closable: true });
		
		var inspector = new LiteGUI.Inspector( {name_width:"50%"});

		inspector.on_refresh = function()
		{
			inspector.showObjectFields( render_settings );
			inspector.addSeparator();
			inspector.addStringButton(null,"",{ callback_button: function(v) { render_settings[v] = true; inspector.refresh(); },button:"+" });
		}

		inspector.refresh();

		inspector.onchange = function(){
			LS.GlobalScene.refresh();
		}

		dialog.add( inspector );
		dialog.adjustSize();
		dialog.show();
	},

	showRenderFrameContextDialog: function( render_context, callback )
	{
		var dialog = new LiteGUI.Dialog( { title:"Render Context", width: 400, draggable: true, closable: true });
		
		var inspector = new LiteGUI.Inspector( {name_width:"50%"});
		inspector.showObjectFields( render_context );
		inspector.addButton(null,"Clear Textures",{ callback: function(){
			render_context.clearTextures();
			LS.GlobalScene.refresh();
		}});

		inspector.onchange = function(){
			if(callback)
				callback( render_state );
			LS.GlobalScene.refresh();
		}

		dialog.add( inspector );
		dialog.adjustSize();
		dialog.show();
	},

	showRenderStateDialog: function( render_state, callback )
	{
		var dialog = new LiteGUI.Dialog( { title:"Render State", width: 400, draggable: true, closable: true });
		
		var inspector = new LiteGUI.Inspector( {name_width:"50%"});
		inspector.showObjectFields( render_state );

		inspector.onchange = function(){
			if(callback)
				callback( render_state );
			LS.GlobalScene.refresh();
		}

		dialog.add( inspector );
		dialog.adjustSize();
		dialog.show();
	},

	onDropOnNode: function( node, event )
	{
		if(!node)
			return;
		if(node.constructor !== LS.SceneNode )
		{
			console.error("onDropOnNode expect SceneNode");
			return;
		}

		var block = false;

		var item_uid = event.dataTransfer.getData("uid");
		var item_type = event.dataTransfer.getData("type");

		var item = null;
		if(item_type == "SceneNode")
			item = LSQ.get( item_uid );
		else if(item_type == "Component")
			item = LS.GlobalScene.findComponentByUId( item_uid );
		else if(item_type == "Material")
			item = LS.GlobalScene.findMaterialByUId( item_uid );

		if( item && item.constructor == LS.SceneNode && node != item )
		{
			node.addChild( item );		
			console.log("Change parent");
			block = true;
		}
		
		if(item && item.constructor.is_component)
		{
			var component = item;
			if(node != component.root)
			{
				if(event.shiftKey)
				{
					var new_component = component.clone();
					node.addComponent( new_component );
					CORE.userAction( "component_created", new_component );
					console.log("Component cloned");
				}
				else
				{
					CORE.userAction( "component_moved", component );
					component._root.removeComponent( component );
					node.addComponent( component );
					console.log("Component moved");
				}
				block = true;
			}
		}

		if( item && item.constructor.is_material )
		{
			var material = item;
			if(material._root) //belong to one node
			{
				var new_material = material.clone();
				node.material = new_material;
				console.log("Material cloned");
			}
			else
			{
				node.material = material.uid;
				console.log("Material assigned");
			}
			block = true;
		}
		
		if (item_type == "resource")
		{
			var filename = event.dataTransfer.getData("res-fullpath");
			block = this.onDropResourceOnNode( filename, node, event );
		}

		if(event.dataTransfer.files && event.dataTransfer.files.length)
		{
			block = ImporterModule.onItemDrop( event, { node: node });
		}

		RenderModule.requestFrame();
		EditorModule.refreshAttributes();
		return block;
	},

	//allows to drop script or materials in a node
	onDropResourceOnNode: function( resource_filename, node, event )
	{
		var resource = LS.ResourcesManager.getResource( resource_filename );
		if(!resource)
			LS.ResourcesManager.load( resource_filename, inner );			
		else
			inner( resource );

		event.stopPropagation();

		//this is hardcoded, we need a system to know which file types are allowed to be drag on top of a node
		var ext = LS.RM.getExtension( resource_filename );
		if( ext == "js" || ext == "json") //script or material
			return true;

		function inner( resource )
		{
			if( !resource )
			{
				console.warn("No resource");
				return;
			}
			
			if( !resource.assignToNode )
			{
				console.warn("Resource type has no assignToNode method: " + LS.getObjectClassName( resource ) );
				return;
			}

			resource.assignToNode( node );
			RenderModule.requestFrame();
			EditorModule.inspectObject( node );
		}

	},

	//Resets all, it should leave the app state as if a reload was done
	resetEditor: function()
	{
		LS.GlobalScene.clear();
		LS.ResourcesManager.reset();
		LEvent.trigger(this,"resetEditor");
		InterfaceModule.setStatusBar();
	},

	reloadEditor: function( keep_scene )
	{
		if(keep_scene)
			localStorage.setItem("_refresh_scene", JSON.stringify( LS.GlobalScene.serialize() ) );
		location.reload();
	},

	copyNodeToClipboard: function( node )
	{
		if(!node)
			return;

		var data = node.serialize();
		data.uid = null; //remove UID
		data._object_class = LS.getObjectClassName(node);
		LiteGUI.toClipboard( data );
	},

	pasteNodeFromClipboard: function( parent ) {
		var data = LiteGUI.getLocalClipboard();
		if( !data )
			return;
		if(data._object_class != "SceneNode")
			return;

		data.uid = null; //remove UID

		var node = new LS.SceneNode();
		node.configure(data);

		parent = parent || LS.GlobalScene.root;
		parent.addChild(node);

		SelectionModule.setSelection( node );
		EditorModule.inspect( LS.GlobalScene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	copyComponentToClipboard: function(component) {
		CORE.userAction( "component_changed", component );
		var data = component.serialize();
		data._object_class = LS.getObjectClassName(component);
		data.uid = null; //remove UID
		LiteGUI.toClipboard( data );
	},

	pasteComponentFromClipboard: function(component) {
		CORE.userAction( "component_changed", component );
		var data = LiteGUI.getLocalClipboard();
		if( !data )
			return;
		data.uid = null; //remove UID
		component.configure( data ); 
		LiteGUI.trigger(component,"changed");
		EditorModule.inspect(LS.GlobalScene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	pasteComponentInNode: function(node)
	{
		CORE.userAction("node_changed", node);
		var data = LiteGUI.getLocalClipboard();
		if(!data || !data._object_class)
			return;
		data.uid = null; //remove UID
		var component = new LS.Components[ data._object_class ]();
		node.addComponent(component);
		component.configure(data); 
		EditorModule.inspect(node); //update interface
		RenderModule.requestFrame();
	},	

	resetNodeComponent: function(component) {
		CORE.userAction( "component_changed", component );
		if(component.reset)
			component.reset();
		else
			component.configure( (new LS.Components[ LS.getObjectClassName(component)]()).serialize() ); 
		LiteGUI.trigger(component, "changed");
		EditorModule.inspect( LS.GlobalScene.selected_node ); //update interface
		RenderModule.requestFrame();
	},

	shareNodeComponent: function( component )
	{
		DriveModule.showSelectFolderFilenameDialog( "component.COMP.json", function( folder, filename, fullpath ){
			var data = component.serialize();
			data.object_class = LS.getObjectClassName( component );
			data.is_data = true;
			delete data.uid;
			var res = new LS.Resource();
			res.category = LS.TYPES.COMPONENT;
			res.setData( JSON.stringify( data ) );
			res.filename = filename;
			res.fullpath = fullpath;
			LS.RM.registerResource( fullpath, res );
			DriveModule.saveResource( res );
		}, { extension: "json", allow_no_folder: true } );
	},

	deleteNodeComponent: function(component) {
		var node = component._root;
		if(!node)
			return;
		CORE.userAction("component_deleted", component );
		LEvent.trigger( LS.GlobalScene, "nodeComponentRemoved", component );
		node.removeComponent( component ); 
		EditorModule.inspect( node );
		RenderModule.requestFrame(); 
	},

	deleteNode: function(node) {
		if( !node || !node.parentNode )
			return;
		CORE.userAction( "node_deleted", node );
		node.parentNode.removeChild( node ); 
		EditorModule.inspect();
		RenderModule.requestFrame(); 
	},

	//************************

	loadAndSetTexture: function (node, attr, name, data)
	{
		if(!data)
		{
			if (LS.ResourcesManager.textures[name])
			{
				node[attr] = name;
				return;
			}
			data = name; //maybe its a url
		}

		var img = new Image();
		img.type = 'IMG';
		img.onload = function(e)
		{
			img.onload = null;
			var tex = LS.ResourcesManager.processImage(name,img);
			node[attr] = name;
		}
		img.src = data;
	},

	cloneNode: function(node, use_same_parent, skip_undo)
	{
		if(!node) return;
		
		var new_node = node.clone();
		//new_node.transform.fromMatrix( node.transform.getGlobalMatrix(), true );
		var parent = LS.GlobalScene.root;
		var index = undefined;
		if(use_same_parent)
		{
			parent = node.parentNode;
			index = parent._children.indexOf( node ) + 1;
		}
		parent.addChild( new_node, index );

		if(!skip_undo)
			CORE.userAction( "node_created", new_node );

		return new_node;
	},

	cloneNodeMaterial: function( node, skip_undo )
	{
		var material = node.getMaterial();
		material = material.clone();
		delete material["filename"]; //no name
		delete material["fullpath"]; //no name
		node.material = material;
		if(!skip_undo)
			CORE.userAction( "node_created", node );
	},

	//interaction
	removeSelectedNodes: function()
	{
		SelectionModule.removeSelectedInstances();
	},

	pasteComponent: function(node)
	{

	},

	// returns the root node
	getAddRootNode: function()
	{
		return LS.GlobalScene.root; //Scene.selected_node
	},

	updateCreatedNodePosition: function( node )
	{
		var current_camera = RenderModule.getActiveCamera();
		node.transform.position = current_camera.getCenter();
	},

	setPropertyValueToSelectedNode: function(cmd, tokens)
	{
		var node = SelectionModule.getSelectedNode();
		if(!node)
			return;
		CORE.userAction("node_changed", node);
		var value = tokens[2];
		if( !isNaN(value) )
			value = parseFloat(value);
		else if(value == "true" || value == "false")
			value = value == "true";
		else if(value == "null")
			value = null;

		var r = node.setPropertyValue( tokens[1], value );
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	createGraph: function()
	{
		var compo = new LS.Components.GraphComponent();
		var node = SelectionModule.getSelectedNode() || LS.GlobalScene.root;
		CORE.userAction("node_changed", node);
		node.addComponent(compo);
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
		GraphModule.editInstanceGraph( compo,null,true );
	},

	createNullNode: function( parent )
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("node") );
		node.material = null;
		parent = parent || EditorModule.getAddRootNode();
		parent.addChild( node );
		EditorModule.updateCreatedNodePosition( node );
		CORE.userAction( "node_created", node );
		SelectionModule.setSelection(node);
		return node;
	},

	createNodeWithMesh: function(mesh_name, options)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("mesh") );
		node.material = new LS.StandardMaterial();
		node.setMesh(mesh_name);
		EditorModule.getAddRootNode().addChild( node );
		EditorModule.updateCreatedNodePosition( node );
		CORE.userAction( "node_created", node );
		SelectionModule.setSelection(node);

		LS.ResourcesManager.load( mesh_name, options );
		return node;
	},

	createCameraNode: function()
	{
		var current_camera = RenderModule.getActiveCamera();

		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("camera") );
		var camera = new LS.Camera( current_camera );
		camera.resetVectors();
		node.addComponent( camera );
		camera.lookAt( current_camera.getEye(), current_camera.getCenter(), current_camera.up );

		EditorModule.getAddRootNode().addChild( node );
		//EditorModule.updateCreatedNodePosition( node );
		CORE.userAction( "node_created", node );
		SelectionModule.setSelection( node );
		return node;
	},

	createLightNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("light") );
		node.addComponent( new LS.Light() );
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.updateCreatedNodePosition( node );
		CORE.userAction( "node_created", node );
		SelectionModule.setSelection(node);
		return node;
	},

	createPrimitive: function(info, name)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName(name || "primitive") );
		node.addComponent( new LS.Components.GeometricPrimitive( info ) );
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.updateCreatedNodePosition( node );
		CORE.userAction( "node_created", node );
		SelectionModule.setSelection(node);
		return node;
	},

	createTemplate: function(name, array)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName( name ) );
		for(var i in array)
		{
			var compo_class = array[i].component;
			if(compo_class.constructor === String)
				compo_class = LS.Components[ compo_class ];
			var component = new compo_class( array[i].data );
			node.addComponent( component );
		}
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.updateCreatedNodePosition( node );
		CORE.userAction( "node_created", node );
		SelectionModule.setSelection(node);
		return node;
	},

	addMaterialToNode: function()
	{
		var selected_node = SelectionModule.getSelectedNode();
		if(!selected_node || LS.GlobalScene.selected_node.material )
			return;
		selected_node.material = new LS.StandardMaterial();
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	addComponentToNode: function( node, component_name )
	{
		if(!node)
			return;
		if(!LS.Components[ component_name ] )
		{
			console.log("No component found with name: ", component_name );
			return;
		}

		node.addComponent( new LS.Components[ component_name ]() );
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	//maybe move this somewhere else
	showCreateResource: function(resource, on_complete, extension, options )
	{
		options = options || {};

		extension = extension || "json";

		LiteGUI.prompt( options.title || "Resource name", inner, { value: options.value } );

		function inner(name)
		{
			name = name.replace(/ /gi,"_"); //change spaces by underscores
			if(!resource.filename)
			{
				resource.id = null;
				resource.name = name;
				var filename = name;
				if( LS.RM.getExtension( filename ) != extension )
					filename = name + "." + extension;
				resource.filename = filename;
			}

			//save the resource info in resources
			LS.ResourcesManager.registerResource( resource.filename, resource ); 

			if(on_complete)
				on_complete( resource.filename, resource );
		}
	},

	//generic (called from EditorView.mouseup on right click on canvas, which is called from CanvasManager)
	showCanvasContextMenu: function( instance, event )
	{
		var options = [
			{ title: "View", has_submenu: true },
			{ title: "Create", has_submenu: true },
			{ title: "Widgets", has_submenu: true }
		];

		var instance_classname = null;

		if(instance)
		{
			options.push(null);
			if( instance.constructor === LS.SceneNode ) //for nodes
			{
				options.push({ title: "Node", has_submenu: true});
			}
			else if( instance.constructor.is_component ) //for components
			{
				instance_classname = LS.getObjectClassName(instance);
				options.push({ title: instance_classname, has_submenu: true });
			}
			else //for anything else?
			{
				var actions = null;
				if( instance.getActions )
					actions = instance.getActions();
				else if( instance.constructor.getActions )
					actions = instance.constructor.getActions();

				if(actions)
				{
					options.push(null);
					for(var i in actions)
						options.push( actions[i] );
				}
			}
		}

		var menu = new LiteGUI.ContextMenu( options, { ignore_item_callbacks: true, event: event, title: "Canvas", autoopen: false, callback: function( action, o, e ) {
			if(action.title == "View")
			{
				var viewport = RenderModule.getViewportUnderMouse(e);
				viewport.showContextMenu( e, menu );
				return true;
			}

			if(action.title == "Node")
			{
				EditorModule.showNodeContextMenu( instance, e, menu );
				return true;
			}

			if(action.title == "Create")
			{
				EditorModule.showCreateContextMenu( instance, e, menu );
				return true;
			}

			if(action.title == "Widgets")
			{
				EditorModule.showCanvasWidgetsContextMenu( instance, e, menu );
				return true;
			}

			if(action.title && action.title == instance_classname)
			{
				EditorModule.showComponentContextMenu( instance, e, menu );
				return true;
			}

			if(instance)
			{
				if( instance.doAction )
					instance.doAction( action );
				else if( instance.constructor.doAction )
					instance.constructor.doAction( action );
			}
		}});
	},

	//for any instance (node, component, etc)
	showInstanceContextMenu: function( instance, event )
	{
		if(!instance)
			return;

		var title = null;
		var options = [];

		if( instance.constructor === LS.SceneNode )
			return this.showNodeContextMenu( instance, event );
		else if( instance.constructor.is_component )
			return this.showComponentContextMenu( instance, e, menu );
		else //any instance
		{
			var actions = null;
			if( instance.getActions )
				actions = instance.getActions();
			else if( instance.constructor.getActions )
				actions = instance.constructor.getActions();

			if(actions)
			{
				options.push(null);
				for(var i in actions)
					options.push( actions[i] );
			}
		}

		if(!options.length)
			return;

		var menu = new LiteGUI.ContextMenu( options, { title: title, ignore_item_callbacks: true, event: event, callback: function( action, o, e ) {
			if(instance)
			{
				if( instance.doAction )
					instance.doAction( action );
				else if( instance.constructor.doAction )
					instance.constructor.doAction( action );
			}
		}});
	},

	showNodeContextMenu: function( node, event, prev_menu )
	{
		if(!node || node.constructor !== LS.SceneNode || !node.getActions)
			return;

		var actions = node.getActions();
		var actions_array = [];
		if(actions)
			for(var i in actions)
				actions_array.push( actions[i] );

		if(node._components && node._components.length)
			actions_array.unshift( { title: "Components", has_submenu: true, show_components: true }, null );

		var menu = new LiteGUI.ContextMenu( actions_array, { ignore_item_callbacks: true, event: event, title:"Node", parentMenu: prev_menu, callback: function( action, options, evt ) {
			if(action.show_components)
				inner_list_components( evt );
			else
				node.doAction( action );
		}});

		function inner_list_components( evt )
		{
			var components = [];
			for(var i = 0; i < node._components.length; ++i)
			{
				var compo = node._components[i];
				components.push( { title: LS.getObjectClassName( compo ), component: compo, has_submenu: true, index: i } );
			}

			var compomenu = new LiteGUI.ContextMenu( components, { event: evt, title:"Node", parentMenu: menu, callback: function( v, options, evt ) {
				EditorModule.showComponentContextMenu( v.component, evt, compomenu );
			}});
		}
	},

	//show the context menu of a component
	showComponentContextMenu: function( component, event, prev_menu )
	{
		if( !component || !component.constructor.is_component )
			return;

		//defined in actions.js (editor, not LS)
		var actions = LS.BaseComponent.getActions( component );
		if(!actions)
			return;

		var title = LS.getObjectClassName( component );

		var menu = new LiteGUI.ContextMenu( actions, { ignore_item_callbacks: true, event: event, parentMenu: prev_menu, title: LS.getObjectClassName( component ), callback: function(action, options, event) {
			LS.BaseComponent.doAction( component, action );
			LS.GlobalScene.requestFrame();
			EditorModule.refreshAttributes();
		}});

		//make the title draggable
		var title = menu.root.querySelector(".litemenu-title");
		var icon = EditorModule.getComponentIconHTML( component );
		title.insertBefore( icon, title.firstChild );

		return menu;
	},

	showCreateContextMenu: function( instance, e, prev_menu )
	{
		var options = ["SceneNode","Light","Camera","Graph"];

		var canvas_event = EditorView._canvas_event || e;
		GL.augmentEvent(canvas_event); //adds canvasx and canvasy
		var position = RenderModule.testGridCollision( canvas_event.canvasx, canvas_event.canvasy );

		var menu = new LiteGUI.ContextMenu( options, { event: e, title: "Create", parentMenu: prev_menu, callback: function(v) { 
			var node = null;
			if(v == "SceneNode")
				node = EditorModule.createNullNode();
			else if(v == "Light")
				node = EditorModule.createLightNode();
			if(v == "Camera")
				node = EditorModule.createCameraNode();
			if(v == "Graph")
				node = EditorModule.createGraph();

			if(node && position)
				node.transform.position = position;

			LS.GlobalScene.refresh();
		}});
	},

	showCanvasWidgetsContextMenu: function( v, e, prev_menu )
	{
		var that = this;
		var options = [];

		for(var i in this.canvas_widgets)
		{
			var w = this.canvas_widgets[i];
			options.push(i);
		}

		if(!options.length)
			return;

		var menu = new LiteGUI.ContextMenu( options, { event: e, title: "Canvas Widgets", parentMenu: prev_menu, callback: function(v) { 
			var widget_class = that.canvas_widgets[v];
			if(!widget_class)
				return;
			var widget = new widget_class();
			RenderModule.canvas_manager.root.addChild( widget );
			LS.GlobalScene.refresh();
		}});
	},

	showSelectSceneCameraContextMenu: function( e, parent_menu, callback )
	{
		var that = this;

		var options = [];
		var scene_cameras = LS.GlobalScene.getAllCameras();
		for(var i = 0; i < scene_cameras.length; i++)
		{
			var scene_camera = scene_cameras[i];
			options.push( { title: "Cam " + scene_camera._root.name, camera: scene_camera } );
		}

		var submenu = new LiteGUI.ContextMenu( options, { event: e, title: "Cameras", parentMenu: parent_menu, callback: function(v) {
			if(callback)
				callback( v.camera )
		}});
	},

	showAddMaterialToNode: function( node, on_complete )
	{
		node = node || SelectionModule.getSelectedNode();

		if( !node )
		{
			LiteGUI.alert("You must select a node to attach a material");
			return;
		}

		var dialog = new LiteGUI.Dialog( { id: "dialog_materials", title:"Materials", close: true, minimize: true, width: 300, height: 230, scroll: false, draggable: true});
		dialog.show('fade');

		var selected = null;
		var list_widget = null;

		var mats = [];
		for(var i in LS.MaterialClasses)
			mats.push( { icon: EditorModule.icons_path + LS.MaterialClasses[i].icon, ctor: LS.MaterialClasses[i], name: LS.getClassName( LS.MaterialClasses[i] ) });

		var filter = "";
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Filter", filter, { callback: function(v) {
			filter = v;
			mats = [];
			for(var i in LS.MaterialClasses)
			{
				var name = LS.getClassName( LS.MaterialClasses[i] );
				if(name.indexOf(filter) != -1)
					mats.push( { icon: EditorModule.icons_path + LS.MaterialClasses[i].icon, ctor: LS.MaterialClasses[i], name: name });
			}
			list_widget.updateItems(mats);
		}});

		list_widget = widgets.addList( null, mats, { height: 140, callback: inner_selected, callback_dblclick: inner_add });
		widgets.widgets_per_row = 1;

		var info_area = widgets.addContainer("", { height:110 });
		info_area.style.padding = "8px";
		info_area.style.background = "#111";
		info_area.style.borderRadius = "2px";

		widgets.addButton(null,"Add", { className:"big", callback: inner_add });

		dialog.add( widgets );
		dialog.adjustSize();

		function inner_selected(value)
		{
			selected = value;
			if(value)
			{
				var desc = value.ctor.description || "No description available for this material.";
				desc = desc.replace(/\n/g, "<br />");
				info_area.innerHTML = desc;
			}
		}

		function inner_add()
		{
			if(!node || !selected )
			{
				if( on_complete )
					on_complete(null);
				dialog.close();
				return;
			}

			var material = new selected.ctor;

			CORE.userAction( "node_material_assigned", node, material );
			node.material = material;
			CORE.afterUserAction( "node_material_assigned", node, material );

			dialog.close();
			RenderModule.requestFrame();
			if( on_complete )
				on_complete( material );
		}
	},

	showAddComponentToNode: function( root_instance, on_complete )
	{
		root_instance = root_instance || this.inspector.instance;

		if( !root_instance || root_instance.constructor != LS.SceneNode )
		{
			LiteGUI.alert("You must select a node to attach a component");
			return;
		}

		var dialog = new LiteGUI.Dialog( { id: "dialog_components", title:"Components", close: true, minimize: true, width: 400, scroll: false, draggable: true});
		dialog.show('fade');

		var selected_component = null;
		var list_widget = null;

		var compos = [];

		var filter = "";
		var widgets = new LiteGUI.Inspector();
		var filter_widget = widgets.addString("Filter", filter, { focus:true, immediate:true, callback: function(v) {
			filter = v.toLowerCase();
			inner_refresh();
		}});

		list_widget = widgets.addList(null, compos, { height: 364, callback: inner_selected, callback_dblclick: function(v){
			selected_component = v;
			inner_add();
		}});

		inner_refresh();

		widgets.widgets_per_row = 1;

		var icons = list_widget.querySelectorAll(".icon");
		for(var i = 0; i < icons.length; i++)
			icons[i].onerror = function() { this.src = "imgs/mini-icon-question.png"; }

		widgets.addButton("Import from repository","Open", { name_width: 200, callback: function(){
			PluginsModule.showAddonsDialog(function(){
				inner_refresh();
			});
		}});
		widgets.addButton(null,"Add", { className:"big", callback: inner_add });

		dialog.add( widgets );
		dialog.center();

		function inner_refresh()
		{
			compos = [];
			for(var i in LS.Components)
			{
				var ctor = LS.Components[i];
				var name = LS.getClassName( ctor );
				if(!filter || name.toLowerCase().indexOf(filter) != -1)
				{
					var o = { ctor: ctor, name: name };
					if( ctor.icon )
						o.icon = EditorModule.icons_path + ctor.icon;
					else
						o.icon = EditorModule.icons_path + "mini-icon-question.png";
					compos.push(o);
				}
			}

			compos.sort(function compare(a,b) {
			  if (a.name < b.name)
				return -1;
			  if (a.name > b.name)
				return 1;
			  return 0;
			});

			list_widget.updateItems(compos);
		}

		function inner_selected(value)
		{
			selected_component = value;
		}

		function inner_add() { 
			if(!root_instance|| !selected_component)
			{
				dialog.close();
				if(on_complete)
					on_complete();
				return;
			}

			if(!root_instance.addComponent)
				return;

			var compo = new selected_component.ctor;
			root_instance.addComponent( compo );
			CORE.userAction("component_created", compo );

			dialog.close();
			if(on_complete)
				on_complete( compo );
			//EditorModule.inspect( root_instance, compo );
			RenderModule.requestFrame();
		}
	},

	showSelectResource: function( options )
	{
		var dialog = new LiteGUI.Dialog({ id: "select-resource-dialog", title: "Select resource", close: true, width: 800, height: 500, scroll: false, resizable: true, draggable: true});
		var resources_widget = new ResourcesPanelWidget(null,{skip_actions:true});
		if(options.type)
			resources_widget.filterByCategory( options.type );
		resources_widget.showMemoryResources();

		LiteGUI.bind( resources_widget, "resource_selected", inner_selected );
		dialog.add( resources_widget );
		dialog.show();
		return dialog;

		function inner_selected( event )
		{
			var fullpath = event.detail;
			var multiple = options.allow_multiple && event && event.shiftKey; //not used now
			if(!multiple)
				dialog.close();
			if(options.on_complete)
				options.on_complete(fullpath);
			if(fullpath && !options.skip_load)
				LS.ResourcesManager.load( fullpath, null, options.on_load );
			return true;
		}
	},

	//shows a dialog to select a node
	showSelectNode: function(on_complete, options)
	{
		options = options || {};

		var dialog = new LiteGUI.Dialog( { id: "dialog_nodes", title: options.title || "Select node", close: true, minimize: true, width: 300, height: 410, resizable: true, scroll: false, draggable: true});
		dialog.show( null, this.root );

		/*
		var tree = new SceneTreeWidget();
		dialog.add( tree );
		*/

		var scene = LS.GlobalScene;
		var list = null;

		//*
		var selected_value = options && options.selected ? options.selected : null;
		var selected_index = -1;
		var nodes = [];
		for(var i = 0; i < scene._nodes.length; i++ )
		{
			var node = scene._nodes[i];
			if( selected_value == node )
				selected_index = i;
			nodes.push( { name: node._name, node: node } );
		}

		var widgets = new LiteGUI.Inspector({height: "100%", noscroll: true });
		widgets.addString(null,"",{
			callback: function(v){
				list.filter( function(item, element) { 
					if(!v)
						return true;
					return element.innerHTML.toLowerCase().indexOf( v.toLowerCase() ) != -1;
				});
			},
			placeHolder: "search by name..."
		});

		list = widgets.addList(null, nodes, { height: "calc(100% - 40px)", callback: inner_selected });
		widgets.widgets_per_row = 1;
		widgets.addButton(null,"Select", { callback: function() { 
			if(!selected_value)
			{
				dialog.close();
				return;
			}

			dialog.close();
			if(on_complete)
				on_complete( selected_value.node );
			RenderModule.requestFrame();
		}});

		if(selected_index != -1)
			list.selectIndex( selected_index );

		dialog.add( widgets );
		//dialog.adjustSize();

		function inner_selected(value)
		{
			selected_value = value;
		}
		//*/
	},

	//shows a dialog to select an existing component
	showSelectComponent: function( selected_component, filter_type, on_complete, widget )
	{
		var dialog = new LiteGUI.Dialog( { id: "dialog_component", title:"Select Component " + ( filter_type ? "[" + filter_type + "]" : "" ), close: true, minimize: true, width: 400, height: 610, scroll: false, draggable: true});
		dialog.show('fade');

		var area = new LiteGUI.Area();
		dialog.add( area );

		area.split("horizontal",["50%",null]);

		var selected_node = selected_component ? selected_component._root : null;
		var scene = LS.GlobalScene;

		var filter_component = null;
		if(filter_type)
			filter_component = LS.Components[ filter_type ];

		var nodes = [];
		for(var i = 0; i < scene._nodes.length; i++ ) //skip root node
		{
			var node = scene._nodes[i];
			var v = { name: node._name, node: node };
			if( filter_component && !node.getComponent( filter_component ) )
				continue;
			if(node == selected_node)
				v.selected = true;
			nodes.push( v );
		}

		var widgets = new LiteGUI.Inspector();
		widgets.addTitle( "Nodes ");
		widgets.addList( null, nodes, { height: 160, callback: inner_selected_node });
		area.getSection(0).add( widgets );

		var widgets_right = new LiteGUI.Inspector();
		var components_list = [];
		widgets_right.addTitle( "Components");
		var widget_components_list = widgets_right.addList( null, components_list, { height: 140, callback: inner_selected_component });
		widgets_right.addButton(null,"Select", { className:"big", callback: function() { 
			if(!selected_component)
			{
				dialog.close();
				return;
			}
			dialog.close();
			if(on_complete)
				on_complete.call( widget || this, selected_component );
			RenderModule.requestFrame();
		}});
		area.getSection(1).add( widgets_right );

		dialog.adjustSize();

		function inner_selected_node( value )
		{
			if(!value)
				return;

			selected_node = value.node;

			var components = selected_node.getComponents();
			components_list = [];
			for(var i = 0; i < components.length; i++)
			{
				var compo = components[i];
				var type = LS.getObjectClassName(compo);
				if(filter_component && filter_component != compo.constructor)
					continue;
				components_list.push( { name: type, uid: compo.uid, component: compo });
			}
			widget_components_list.updateItems( components_list );
		}

		function inner_selected_component(value)
		{
			selected_component = value.component;
		}
	},

	showComponentHelp: function( component )
	{
		var url = CodingModule.component_help_url + LS.getObjectClassName( component ) + ".html";
		if(component.constructor.help_url)
			url = component.constructor.help_url;
		window.open( url, "_blank" );
	},

	showCreateFromJSONDialog: function()
	{
		var dialog = new LiteGUI.Dialog( {title:"from JSON", close: true, minimize: true, width: 400, height: 620, scroll: false, draggable: true});
		dialog.show('fade');

		var widgets = new LiteGUI.Inspector();
		dialog.add(widgets);

		var json = null;

		widgets.addInfo(null,"Paste a JSON code of a node here.");
		widgets.addTextarea(null,"", { height: 500, callback: function(v){
			try
			{
				json = JSON.parse(v);
			}
			catch (err)
			{
				LiteGUI.alert("There are errors in the JSON");
			}
		}});
		widgets.addButton(null,"Create", function(v){
			if(!json)
				return;

			var node = null;

			if(json.components) //is node
			{
				node = new LS.SceneNode();
				node.configure( json );
				EditorModule.getAddRootNode().addChild( node );
			}
			else if(json.object_class && LS.Components[ json.object_class ] )//in component
			{
				node = SelectionModule.getSelectedNode();
				var component = new LS.Components[ json.object_class ]();
				component.configure( json );
				node.addComponent(component);
			}

			LS.GlobalScene.requestFrame();
			dialog.close();
		});

		dialog.adjustSize(10);
	},

	getComponentIconHTML: function( component )
	{
		if(!LiteGUI.missing_icons)
			LiteGUI.missing_icons = {};
		var icon_url = "mini-icon-question.png";
		if(component.constructor.icon && !LiteGUI.missing_icons[ component.constructor.icon ] )	
			icon_url = component.constructor.icon;

		var icon = document.createElement("span");
		icon.className = "icon";
		icon.style.width = "20px";
		icon.setAttribute("draggable",true);
		icon.innerHTML = "<img width=14 height=14 title='Drag icon to transfer' src='"+ EditorModule.icons_path + icon_url+"'/>";
		icon.addEventListener("dragstart", function(event) { 
			
			event.dataTransfer.setData("uid", component.uid);
			if(!component.root)
				return false;

			var classname = LS.getObjectClassName( component );
			var locator;
			if( event.shiftKey )
				locator = component.getLocator();
			else
				locator = component.root.name + "/" + classname;

			event.dataTransfer.setData("locator", locator );
			event.dataTransfer.setData("type", "Component");
			event.dataTransfer.setData("node_uid", component.root.uid );
			event.dataTransfer.setData("class", classname );
			if(component.setDragData)
				component.setDragData(event);
		});
		icon.addEventListener("click", function(e){
			SelectionModule.setSelection( component );
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		var icon_img = icon.querySelector(".icon img");
		if(icon_img)
			icon_img.onerror = function() { 
				LiteGUI.missing_icons[ component.constructor.icon ] = true;
				this.src = "imgs/mini-icon-question.png";
				this.onerror = null; //avoid requesting it ad infinitum when the connection is broken
			}
		return icon;
	},

	getSceneElementFromDropEvent: function(event)
	{
		var item_uid = event.dataTransfer.getData("uid");
		var item_type = event.dataTransfer.getData("type");
		var item = null;
		if(item_type == "SceneNode" || item_type == "Component")
			item = LSQ.get( item_uid );
		return item;
	},

	centerCameraInSelection: function()
	{
		var center = SelectionModule.getSelectionCenter();
		center = center || vec3.create();
		cameraTool.setFocusPoint(center);
		RenderModule.requestFrame();
	},

	focusCameraInBoundingBox: function( bbox )
	{
		var radius = BBox.getRadius( bbox );		
		var center = BBox.getCenter( bbox );
		cameraTool.setFocusPoint( center, radius * 2 );
		RenderModule.requestFrame();
	},

	focusCameraInSelection: function()
	{
		var node = SelectionModule.getSelectedNode();
		if(!node)
			return;
		var bbox = node.getBoundingBox();
		this.focusCameraInBoundingBox( bbox );
	},

	//pass event
	focusCameraInPixel: function(e)
	{
		var camera = ToolUtils.getCamera(e);
		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );

		var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, camera );
		if(!instance_info || instance_info.constructor !== LS.SceneNode )
			return false;

		var node = instance_info;

		var info = LS.Physics.raycastNode( ray.origin, ray.direction, node, { triangle_collision: true } );

		//console.log(info);

		if(!info || info.length == 0)
			return;

		var radius = vec3.distance( info[0].position, ray.origin );

		cameraTool.setFocusPoint( info[0].position, radius );
		RenderModule.requestFrame();
	},

	focusCameraInAll: function()
	{
		var bbox = BBox.create();

		var render_instances = LS.GlobalScene._instances;
		if(render_instances)
			for(var i = 0; i < render_instances.length; ++i)
			{
				if(i == 0)
					bbox.set( render_instances[i].aabb );
				else
					BBox.merge( bbox, bbox, render_instances[i].aabb );
			}

		for(var i = 0; i < LS.GlobalScene._nodes.length; ++i)
		{
			var node = LS.GlobalScene._nodes[i];
			if(!node.transform)
				continue;
			var pos = node.transform.getGlobalPosition();
			BBox.extendToPoint( bbox, pos );
		}

		this.focusCameraInBoundingBox( bbox );
	},

	//key actions
	onKeyDown: function(e)
	{
		var keycode = e.keyCode;
		//console.log(keycode);
		switch( keycode )
		{
			case 83: //S
				if(e.ctrlKey)
				{
					SceneStorageModule.fastSaveScene();
					e.preventDefault();
					e.stopPropagation();
				}
				break;
			case 70: //F
				if(e.shiftKey)
					EditorModule.focusCameraInAll();
				else
					EditorModule.focusCameraInSelection();
				break;
			case 80: //P
				if(e.ctrlKey)
					PlayModule.onPlay();
				//else
				e.preventDefault();
				e.stopPropagation();
				return false;
				break;
			case 9: //tab
				InterfaceModule.toggleInspectorTab();
				/*
				e.preventDefault();
				e.stopPropagation();
				return false;
				*/
				break;
			case 8:
			case 46: //delete key only works if the tab is enabled 
				e.preventDefault();
				e.stopPropagation();
				EditorModule.removeSelectedNodes(); 
				return false;
				break;
			case 113: //F2
				console.log( RenderModule.canvas_manager.pause_render ? "unpausing render" : "pausing rendering");
				RenderModule.canvas_manager.pause_render = !RenderModule.canvas_manager.pause_render;
				e.preventDefault();
				e.stopPropagation();
				return false;
				break;
			case 116: //F5
				if(EditorModule.preferences.save_on_exit)
					SceneStorageModule.saveLocalScene("last", {}, LS.GlobalScene, SceneStorageModule.takeScreenshot(256,256) );

				if(EditorModule.preferences.save_on_exit && EditorModule.preferences.reload_on_start)
				{
					window.location.href = "?session=last";
					e.preventDefault();
					e.stopPropagation();
					return false;
				}
				break;
			case 117:  //F6
				this.reloadEditor(true);
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
			case 118: //F7
				if(window.CodingModule)
					CodingModule.reloadProjectScripts();
				break;
			case 38: //UP
				if(e.ctrlKey)
					SelectionModule.selectParentNode();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
			case 39: //RIGHT
				if(e.ctrlKey)
					SelectionModule.selectSiblingNode();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
			case 37: //LEFT
				if(e.ctrlKey)
					SelectionModule.selectSiblingNode( true );
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
			case 40: //DOWN
				if(e.ctrlKey)
					SelectionModule.selectChildNode();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
		}

		CORE.callInModules("onCanvasKeyDown", e);
	},

	/***************/
	onShowPreferencesPanel: function(name,widgets)
	{
		if(name != "editor") return;
		widgets.addFlags( EditorModule.preferences );
	},

	upgradeMaterials: function()
	{
		for(var i in LS.RM.materials)
		{
			var mat = LS.RM.materials[i];
			if( mat.constructor !== LS.MaterialClasses.StandardMaterial )
				continue;
			var new_mat = new LS.MaterialClasses.newStandardMaterial( mat.serialize() );
			new_mat.fullpath = mat.fullpath;
			new_mat.filename = mat.filename;
			LS.RM.materials[i] = new_mat;
			LS.RM.materials_by_uid[ new_mat.uid ] = new_mat;
			LS.RM.resources[ new_mat.fullpath || new_mat.filename ] = new_mat;
		}

		for(var i in LS.GlobalScene._nodes)
		{
			var node = LS.GlobalScene._nodes[i];
			var mat = node.material;
			if(!mat)
				continue;
			if( mat.constructor !== LS.MaterialClasses.StandardMaterial )
				continue;
			node.material = new LS.MaterialClasses.newStandardMaterial( mat.serialize() );
		}

	}
};

CORE.registerModule( EditorModule );


