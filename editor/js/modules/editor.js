/* This module handles the tools to edit the scene */

var EditorModule = { 
	name: "editor",
	icons_path:  "imgs/",

	//to call when editing a node
	node_editors: [],
	material_editors: {},

	selected_data: null, //the extra info about this item selected (which component, which field, etc)

	settings_panel: [ {name:"editor", title:"Editor", icon:null } ],
	settings: { //persistent settings
		autoselect: false,
		autofocus: true,
		save_on_exit: false,
		reload_on_start: true
	},

	commands: {},

	init: function()
	{
		RenderModule.viewport3d.addModule(this);

		if(!gl) 
			return;

		this.createMenuEntries();

		var scene = LS.GlobalScene;
	
		//LEvent.bind( scene, "selected_node_changed", function(e,node) { 
		//	EditorModule.inspectNode( scene.selected_node );
		//});

		LEvent.bind( scene, "scene_loaded", function(e) { 
			EditorModule.inspectNode( scene.root );
		});

		SelectionModule.setSelection( scene.root );

		document.addEventListener("keydown", this.globalKeyDown.bind(this), false );

		this.registerCommands();
	},

	registerCommands: function()
	{
		this.commands["set"] = this.setPropertyValueToSelectedNode.bind(this);
		this.commands["create"] = function(cmd,tokens)
		{
			var that = EditorModule;
			switch(tokens[1])
			{
				case "node": that.createNullNode(); break;
				case "light": that.createLightNode(); break;
				case "plane": that.createPrimitive({ geometry: GeometricPrimitive.PLANE, size: 10, xz: true, subdivisions: 2 }); break;
				case "cube": that.createPrimitive({ geometry: GeometricPrimitive.CUBE, size: 10, subdivisions: 10 }); break;
				case "sphere": that.createPrimitive({ geometry: GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 }); break;
				default: break;
			}
		}
		this.commands["addComponent"] = function(cmd, tokens) { 
			EditorModule.addComponentToNode( SelectionModule.getSelectedNode(), tokens[1] );
			EditorModule.inspectNode( LS.GlobalScene.selected_node );
		};
		this.commands["selectNode"] = function(cmd, tokens) { 
			var node = LS.GlobalScene.getNode( tokens[1] );
			SelectionModule.setSelection( node );
		};
		this.commands["lights"] = function(cmd, tokens) { 
			var lights = LS.GlobalScene._lights;
			if(!lights)
				return;
			EditorModule.inspectObjects(lights);
		};
		this.commands["cameras"] = function(cmd, tokens) { 
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
	},

	createMenuEntries: function()
	{
		var mainmenu = LiteGUI.menubar;
		//buttons

		mainmenu.add("Scene/Settings", { callback: function() { 
			EditorModule.inspectNode( LS.GlobalScene.root ); 
		}});

		mainmenu.separator("Edit");

		mainmenu.add("Edit/Copy Node", { callback: function() { EditorModule.copyNodeToClipboard( SelectionModule.getSelectedNode() ); }});
		mainmenu.add("Edit/Paste Node", { callback: function() { EditorModule.pasteNodeFromClipboard(); }});
		mainmenu.add("Edit/Clone Node", { callback: function() { EditorModule.cloneNode( SelectionModule.getSelectedNode() ); }});
		mainmenu.add("Edit/Delete Node", { callback: function() { EditorModule.removeSelectedNode(); }});
		mainmenu.add("Edit/Focus on node", { callback: function() { cameraTool.setFocusPointOnNode( SelectionModule.getSelectedNode(), true ); }});
		mainmenu.add("Edit/Paste component", { callback: function() { EditorModule.pasteComponentInNode( SelectionModule.getSelectedNode() ); }});

		mainmenu.add("Node/Create node", { callback: function() { EditorModule.createNullNode(); }});
		mainmenu.add("Node/Create camera", { callback: function() { EditorModule.createCameraNode(); }});
		mainmenu.add("Node/Create light", { callback: function() { EditorModule.createLightNode(); }} );
		//mainmenu.separator("Node");
		mainmenu.add("Node/Primitive/Plane", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.PLANE, size: 10, subdivisions: 10, align_z: true}); }});
		mainmenu.add("Node/Primitive/Cube", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.CUBE, size: 10, subdivisions: 10 }); }});
		mainmenu.add("Node/Primitive/Sphere", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Primitive/Hemisphere", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.HEMISPHERE, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Templates/ParticleEmissor", { callback: function() { EditorModule.createTemplate("Particles",[{ component: "ParticleEmissor" }]); }});
		mainmenu.add("Node/Templates/MeshRenderer", { callback: function() { EditorModule.createTemplate("Mesh",[{ component: "MeshRenderer" }]); }});

		mainmenu.add("Node/Add Component", { callback: function() { EditorModule.showAddComponentToNode(null, function(){ EditorModule.refreshAttributes(); } ); }} );
		mainmenu.add("Node/Add Material", { callback: function() { EditorModule.showAddMaterialToNode( null, function(){ EditorModule.refreshAttributes(); }); }} );
		mainmenu.add("Node/Add Script", { callback: function() { 
			CodingModule.onNewScript(); 
			EditorModule.refreshAttributes();
		}});
		mainmenu.add("Node/Check JSON", { callback: function() { EditorModule.checkJSON( SelectionModule.getSelectedNode() ); }} );

		mainmenu.add("View/Default material properties", { callback: function() { EditorModule.inspectInDialog( LS.Renderer.default_material ); }});
		mainmenu.add("View/Layers", { callback: function() { EditorModule.showLayersEditor(); }});

		mainmenu.add("Actions/Reload Shaders", { callback: function() { 
			ShadersManager.reloadShaders(function() { RenderModule.requestFrame(); }); 
		}});

		mainmenu.separator("Project");
		mainmenu.add("Project/Reset", { callback: this.showResetDialog.bind(this) });

		function inner_change_renderMode(v) { RenderModule.setRenderMode(v.value); }
		function inner_is_renderMode(v) { 
			return (RenderModule.render_mode == v.value);
		}
		function inner_is_systemMode(v) { 
			return (EditorModule.coordinates_system == v.value);
		}

		mainmenu.add("View/Show Icons", {  instance: EditorModule.settings, property: "render_icons", type:"checkbox" });
		mainmenu.add("View/Show Grid", {  instance: EditorModule.settings, property: "render_grid", type:"checkbox" });
		mainmenu.add("View/Show Gizmos", {  instance: EditorModule.settings, property: "render_gizmos", type:"checkbox" });
		mainmenu.add("View/Show All Gizmos", {  instance: EditorModule.settings, property: "render_all_gizmos", type:"checkbox" });
		mainmenu.add("View/Hide Shadows", {  instance: RenderModule.render_options, property: "shadows_disabled", type:"checkbox" });

		mainmenu.add("View/Render Mode/Wireframe", {  value: "wireframe", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Flat", {  value: "flat", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Solid", { value: "solid", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Texture", { value: "texture", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Full", { value: "full", isChecked: inner_is_renderMode, callback: inner_change_renderMode });

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

		switch( this.inspector.instance.constructor )
		{
			case LS.SceneNode: this.inspectNode(this.inspector.instance); break;
			case Object: 
			case Array: this.inspectObjects( this.inspector.instance ); break;
			default:
				this.inspectObject(this.inspector.instance); break;
		}
	},

	inspectObjects: function(objects, inspector)
	{
		inspector = inspector || this.inspector;

		inspector.instance = objects;

		inspector.on_refresh = (function()
		{
			inspector.clear();
			for(var i = 0; i < objects.length; i++)
			{
				var object = objects[i];
				if(!object)
					continue;

				if( LS.isClassComponent( object.constructor ) )
					this.showComponentInterface( object, inspector );
				else
					this.showContainerFields( object, inspector );
			}
		}).bind(this);

		inspector.refresh();
	},

	inspectObject: function(object, inspector)
	{
		this.inspectObjects([object],inspector);
		this.inspector.instance = object;
	},

	inspectInDialog: function(object)
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

		var height = ($("#visor").height() * 0.8)|0;

		var dialog = new LiteGUI.Dialog(id, {title: title, close: true, minimize: true, width: 300, height: height, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');
		dialog.setPosition(50 + (Math.random() * 10)|0,50 + (Math.random() * 10)|0);
		dialog.on_close = function()
		{
		
		}

		var inspector = new LiteGUI.Inspector(null,{ name_width: "40%" });
		inspector.on_refresh = function()
		{
			inspector.clear();
			var object_class = object.constructor;
			var editor = object_class["@inspector"];
			if( object.constructor === LS.SceneNode )
				EditorModule.inspectNode( object, null, inspector );
			else if(editor)
				editor.call(this, object, inspector );
			else
				inspector.inspectInstance( object );
			dialog.adjustSize();
		}

		inspector.onchange = function()
		{
			RenderModule.requestFrame();
		}

		inspector.refresh();
		dialog.add(inspector);
		dialog.adjustSize();
		return dialog;
	},

	inspectNode: function( node, component_to_focus, inspector )
	{
		inspector = inspector || this.inspector;
		inspector.instance = node;

		if(!node)
		{
			inspector.clear();
			inspector.on_refresh = null;
			return;
		}

		inspector.on_refresh = (function()
		{
			inspector.clear();
			if(node == LS.GlobalScene.root) //main node use an special editor
			{
				this.showSceneInfo(node, inspector);
			}
			else
			{
				if(typeof(node) == "undefined" || node == null) {
					return;
				}

				if(node._name !== null)
					inspector.addString("name", node._name, { callback: function(v) {
						if(!v)
							return node._name;
						var old_name = node.name;
						if( !node.setName(v) )
							return node._name;
						UndoModule.saveNodeRenamedUndo( node, old_name );
					}});

				inspector.addString("UId", node.uid, { disabled: true });

				if(node.className != null)
					inspector.addString("class", node.className, { callback: function(v) { node.className = v; } });
				if(node.flags && node.flags.visible != null)
					inspector.addCheckbox("visible", node.visible, { pretitle: AnimationModule.getKeyframeCode( node, "visible"), callback: function(v) { node.visible = v; } });

				inspector.addLayers("layers", node.layers, { callback: function(v) {
					node.layers = v;
					RenderModule.requestFrame();
				}});

				//special node editors
				for(var i in this.node_editors)
					this.node_editors[i](node, inspector);
			}

			//components
			this.showComponentsInterfaces( node,inspector );

			//flags
			inspector.addSection("Extras", { collapsed: true });
			if(node.flags)
			{
				inspector.addTitle("Flags");
				inspector.widgets_per_row = 2;
				inspector.addFlags( node.flags, {seen_by_camera:true, seen_by_reflections:true, depth_test: true, depth_write: true, ignore_lights: false, ignore_fog: false, selectable: true} );
				inspector.widgets_per_row = 1;
			}

			inspector.addSection();

			//final buttons
			inspector.addButton(null,"Add component", { callback: function(v) { 
				EditorModule.showAddComponentToNode( node, function(){
					inspector.refresh();
				});
			}});

			inspector.addButtons(null,["Add Script","Add Graph"], { callback: function(v) { 
				if(v == "Add Script")
					CodingModule.onNewScript( node );
				else if(v == "Add Graph")
					GraphModule.onNewGraph( node );
				inspector.refresh();
			}});

			if(component_to_focus)
				inspector.scrollTo( component_to_focus.uid.substr(1) );
			AnimationModule.attachKeyframesBehaviour( inspector );
		}).bind(this);

		inspector.refresh();
	},

	checkJSON: function( object )
	{
		if(!object)
			return;

		var w = window.open("",'_blank');

		w.document.write("<style>* { margin: 0; padding: 0; } html,body { margin: 20px; background-color: #222; color: #eee; } </style>");

		var data = beautifyJSON( JSON.stringify( object.serialize(), null, '\t') );
		w.document.write("<pre>"+data+"</pre>");
		w.document.close();
	},

	//inspects all the components in one container
	showComponentsInterfaces: function(container, inspector)
	{
		//component editors
		var components = container.getComponents();
		for(var i in components)
		{
			var component = components[i];
			this.showComponentInterface(component, inspector);
		}
	},

	//shows the inspector of one component
	showComponentInterface: function(component, inspector)
	{
		if(!component)
			return;

		var node = component._root;

		var component_class = component.constructor;
		var name = LS.getObjectClassName(component);
		var editor = component_class["@inspector"];

		//Create the title of the component
		var icon = "";
		if(component.constructor.icon)	
			icon = "<span class='icon' style='width: 20px'><img src='"+ this.icons_path + component.constructor.icon+"'/></span>";
		var enabler = component.enabled !== undefined ? AnimationModule.getKeyframeCode(component,"enabled") + "<span class='enabler'></span>" : "";
		var is_selected = SelectionModule.isSelected( component );
		var options = {};
		if(is_selected)
			options.className = "selected";
		var title = "<span class='title'>"+name+"</span>";
		var buttons = " <span class='buttons'><img class='options_section' src='imgs/mini-cog.png'></span>";

		if(component.uid)
			options.id = component.uid.substr(1);

		//show the component collapsed and remember it
		options.callback = function(v){
			component._collapsed = !v;
		}
		options.collapsed = component._collapsed;

		//create component section in inspector
		var section = inspector.addSection( icon + enabler + title + buttons, options );

		//right click in title launches the context menu
		section.querySelector(".wsectiontitle").addEventListener("contextmenu", (function(e) { 
			if(e.button != 2) //right button
				return false;
			inner_showActions(e);
			e.preventDefault(); 
			return false;
		}).bind(this));

		//checkbox for enable/disable component
		if(component.enabled !== undefined)
		{
			enabler = inspector.current_section.querySelector('.enabler');
			var checkbox = new LiteGUI.Checkbox( component.enabled, function(v){ 
				component.enabled = v; 
				$(inspector.current_section).trigger("wchange");
				RenderModule.requestFrame();
			});
			checkbox.root.title ="Enable / Disable";
			enabler.appendChild( checkbox.root );
		}

		//save UNDO when something changes
		$(inspector.current_section).bind("wchange", function() { 
			UndoModule.saveComponentChangeUndo( component );
		});

		//used to avoid collapsing section when clicking button
		inspector.current_section.querySelector('.options_section').addEventListener("click", function(e) { 
			e.preventDefault();
			e.stopPropagation();
			return true;
		});

		//it has special editor
		if(editor)
			editor.call(this, component, inspector, section);
		else
			this.showContainerFields( component, inspector );

		//in case the options button is pressed or the right button, show contextual menu
		inspector.current_section.querySelector('.options_section').addEventListener("click", inner_showActions );

		function inner_showActions( e ) { 
			console.log("Show options");
			var actions = ["Info","Copy","Paste","Delete","Reset","Select"];
			if(component.getEditorActions)
				actions = component.getEditorActions( actions );

			var menu = new LiteGUI.ContextualMenu( actions, { event: event, title: name, callback: function(value) {

				var r = null;
				if(component.doEditorAction)
					r = component.doEditorAction( value );
				if(!r)
					EditorModule.onDefaultComponentAction( component, value );
			}});
		}		

	},

	onDefaultComponentAction: function(component, action)
	{
		if(!component)
			return;
		var node = component._root;

		switch(action)
		{
			case "Info": EditorModule.showComponentInfo(component); break;
			case "Copy": EditorModule.copyComponentToClipboard(component); break;
			case "Paste": EditorModule.pasteComponentFromClipboard(component); break;
			case "Delete": EditorModule.deleteNodeComponent(component); break;
			case "Reset": EditorModule.resetNodeComponent(component); break;
			case "Select": SelectionModule.setSelection(component); break;
			default:
				return false;
		}
		return true;
	},

	showContainerFields: function(container, inspector)
	{
		inspector.on_addAttribute = inner;

		inspector.inspectInstance(container, null,null, ["enabled"] );

		inspector.on_addAttribute = null;

		//used to hook the keyframe thing on automatic generated inspectors
		function inner( widget, object, property, value, options )
		{
			options.pretitle = AnimationModule.getKeyframeCode( object, property, options );
		}
	},

	showAddPropertyDialog: function(callback, valid_fields )
	{
		valid_fields = valid_fields || ["string","number","vec2","vec3","vec4","color","texture"];

		var uid = Math.random().toString();
		var id = "dialog_inspector_properties";
		var dialog = document.getElementById( "dialog_inspector_" + uid );

		var height = ($("#visor").height() * 0.8)|0;

		var dialog = new LiteGUI.Dialog(id, {title: "Properties", parent:"#visor", close: true, minimize: true, width: 300, height: 200, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');
		//dialog.setPosition(50 + (Math.random() * 10)|0,50 + (Math.random() * 10)|0);
		var inspector = new LiteGUI.Inspector();

		var property = { name: "myVar", type: "number", value: 0, step: 0.1 };
		var value_widget = null;

		inspector.addString("Name", property.name, { callback: function(v){ property.name = v; } });
		inspector.addString("Label", property.label, { callback: function(v){ property.label = v; } });
		inspector.addCombo("Type", property.type, { values: valid_fields, callback: function(v){ 
			property.type = v;
			var value = null;
			if(v == "number")
			{
				value = 0.0;
				value_widget = inspector.addNumber("Value", value, { step: property.step, replace: value_widget, callback: function(v){ property.value = v; }});
			}
			else if(v == "vec2")
			{
				value = vec2.fromValues(0,0);
				value_widget = inspector.addVector2("Value", value, { step: property.step, replace: value_widget, callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; }});
			}
			else if(v == "vec3")
			{
				value = vec3.fromValues(0,0,0);
				value_widget = inspector.addVector3("Value", value, { step: property.step, replace: value_widget, callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
			}
			else if(v == "color")
			{
				value = vec3.fromValues(0,0,0);
				value_widget = inspector.addColor("Value", value, { replace: value_widget, callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
			}
			else
			{
				value = "";
				value_widget = inspector.add(property.type, "Value", value, { replace: value_widget, callback: function(v){ property.value = v; }});
			}
			property.value = value;
		}});
		
		value_widget = inspector.addNumber("Value", property.value, { step: property.step, callback: function(v){ property.value = v; }});
		inspector.addNumber("Step", property.step, { callback: function(v){ property.step = v; }});

		//inspector.addCombo("Widget","";);

		inspector.addButton(null,"Create",{ callback: function() {
			if(callback) callback(property);
			dialog.close();
		}});

		dialog.content.appendChild(inspector.root);
		dialog.adjustSize();
	},

	showEditPropertiesDialog: function( properties, valid_fields, callback )
	{
		valid_fields = valid_fields || ["string","number","vec2","vec3","vec4","color","texture"];

		var uid = Math.random().toString();
		var id = "dialog_inspector_properties";
		var dialog = document.getElementById( "dialog_inspector_" + uid );

		var height = ($("#visor").height() * 0.8)|0;

		var dialog = new LiteGUI.Dialog(id, {title: "Properties", parent:"#visor", close: true, minimize: true, width: 300, height: 200, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');
		//dialog.setPosition(50 + (Math.random() * 10)|0,50 + (Math.random() * 10)|0);

		var inspector = new LiteGUI.Inspector();
		var selected = null;
		var value_widget = null;

		inner_update();

		function inner_update()
		{
			var properties_by_name = {};
			for(var i in properties)
			{
				if(!selected)
					selected = properties[i].name;
				properties_by_name[ properties[i].name ] = properties[i];
			}

			inspector.clear();

			//choose which property
			inspector.addCombo("Property", properties_by_name[ selected ], { values: properties_by_name, callback: function(v) { 
				selected = v.name;
				inner_update();
			}});

			var property = properties_by_name[ selected ];
			if(!property)
				return;	

			//choose which property
			inspector.addString("Label", property.label || "", { callback: function(v) { 
				property.label = v;
			}});

			inspector.addCombo("Type", property.type, { values: valid_fields, callback: function(v) {
				var change = false;
				if(v != property.value)
				{
					property.type = v;
					change = true;
				}

				inner_value_widget( property, change );
			}});


			//value_widget = inspector.addNumber("Value", property.value, { step: property.step, callback: function(v){ property.value = v; }});
			inner_value_widget(property);

			if( property.type == "number" )
				inspector.addNumber("Step", property.step, { callback: function(v){ property.step = v; }});

			inspector.addButton(null,"Delete",{ callback: function() {
				for(var i = 0; i < properties.length; ++i)
				{
					if( properties[i] != property )
						continue;
					properties.splice(i,1);
					break;
				}
				EditorModule.refreshAttributes();
				inner_update();
			}});

			inspector.addButton(null,"Save",{ callback: function() {
				if(callback) callback(property);
				dialog.close();
			}});

			dialog.adjustSize();
		}

		function inner_value_widget(property, change)
		{
			var type = property.type;

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
			else
			{
				if(change) property.value = "";
				value_widget = inspector.add(property.type, "Value", property.value, { callback: function(v){ property.value = v; }});
			}
		}

		dialog.content.appendChild(inspector.root);
		dialog.adjustSize();
	},

	showResetDialog: function()
	{
		LiteGUI.confirm("Are you sure?", function(v) {
			if(v)
				EditorModule.resetEditor();
		});
	},	

	showNodeInfo: function( node )
	{
		var dialog = new LiteGUI.Dialog("node_info",{ title:"Node Info", width: 400, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Name", node.name, function(v){ node.name = v; });
		widgets.addString("UID", node.uid, function(v){ node.uid = v; });
		widgets.addCheckbox("Visible", node.visible, function(v){ node.flags.visible = v; });
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

	showLayersEditor: function( layers, callback )
	{
		var scene = LS.GlobalScene;

		var dialog = new LiteGUI.Dialog("layers_editor",{ title:"Layers editor", width: 300, height: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();

		if(layers !== undefined)
			widgets.widgets_per_row = 2;

		for(var i = 0; i < 32; ++i)
		{
			widgets.addString(null, scene.layer_names[i] || ("layer"+i), { layer: i, width: "80%", callback: function(v) {
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
		var dialog = new LiteGUI.Dialog("component_info",{ title:"Component Info", width: 400, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Class", LS.getObjectClassName(component), { disabled: true } );
		if(component.enabled !== undefined)
			widgets.addCheckbox("Enabled", component.enabled, function(v){ component.enabled = v; });
		widgets.addString("UID", component.uid, function(v){ component.uid = v; });
		widgets.addString("Locator", component.getLocator(), { disabled: true } );

		if( component.constructor.onComponentInfo )
			component.constructor.onComponentInfo( component, widgets );

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

	//Resets all, it should leave the app state as if a reload was done
	resetEditor: function()
	{
		LS.GlobalScene.clear();
		ResourcesManager.reset();
		LEvent.trigger(this,"resetEditor");
	},

	copyNodeToClipboard: function( node )
	{
		if(!node) return;

		var data = node.serialize();
		data._object_type = LS.getObjectClassName(node);
		LiteGUI.toClipboard( data );
	},

	pasteNodeFromClipboard: function( parent ) {
		var data = LiteGUI.getClipboard();
		if( !data ) return;

		if(data._object_type != "SceneNode")
			return;

		var node = new SceneNode();
		node.configure(data);

		parent = parent || Scene.root;
		parent.addChild(node);

		SelectionModule.setSelection( node );
		EditorModule.inspectNode(Scene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	copyComponentToClipboard: function(component) {
		UndoModule.saveComponentChangeUndo(component);
		var data = component.serialize();
		data._object_type = LS.getObjectClassName(component);
		LiteGUI.toClipboard( data );
	},

	pasteComponentFromClipboard: function(component) {
		UndoModule.saveComponentChangeUndo(component);
		var data = LiteGUI.getClipboard();
		if( !data ) return;
		component.configure( data ); 
		$(component).trigger("changed");
		EditorModule.inspectNode(Scene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	pasteComponentInNode: function(node)
	{
		UndoModule.saveNodeChangeUndo(node);
		var data = LiteGUI.getClipboard();
		if(!data || !data._object_type) return;

		var component = new window[data._object_type]();
		node.addComponent(component);
		component.configure(data); 
		EditorModule.inspectNode(node); //update interface
		RenderModule.requestFrame();
	},	

	resetNodeComponent: function(component) {
		UndoModule.saveComponentChangeUndo(component);
		if(component.reset)
			component.reset();
		else
			component.configure( (new window[ LS.getObjectClassName(component)]()).serialize() ); 
		$(component).trigger("changed");
		EditorModule.inspectNode(Scene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	deleteNodeComponent: function(component) {
		var node = component._root;
		if(!node)
			return;
		UndoModule.saveComponentDeletedUndo( component );

		LEvent.trigger( LS.GlobalScene, "nodeComponentRemoved", component );
		node.removeComponent(component); 
		EditorModule.inspectNode(node);
		RenderModule.requestFrame(); 
	},

	//************************

	loadAndSetTexture: function (node, attr, name, data)
	{
		if(!data)
		{
			if (ResourcesManager.textures[name])
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
			var tex = ResourcesManager.processImage(name,img);
			node[attr] = name;
		}
		img.src = data;
	},

	cloneNode: function(node, use_same_parent, skip_undo)
	{
		if(!node) return;
		
		var new_node = node.clone();
		//new_node.transform.fromMatrix( node.transform.getGlobalMatrix(), true );
		var parent = use_same_parent ? node.parentNode : Scene.root;
		parent.addChild( new_node );

		if(!skip_undo)
			UndoModule.saveNodeCreatedUndo( new_node );

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
			UndoModule.saveNodeCreatedUndo( node );
	},

	//interaction
	removeSelectedNode: function()
	{
		SelectionModule.removeSelectedInstance();
	},

	pasteComponent: function(node)
	{

	},

	// returns the root node
	getAddRootNode: function()
	{
		return LS.GlobalScene.root; //Scene.selected_node
	},

	setPropertyValueToSelectedNode: function(cmd, tokens)
	{
		var node = SelectionModule.getSelectedNode();
		if(!node)
			return;
		UndoModule.saveNodeChangeUndo( node );
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

	createNullNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("node") );
		node.material = null;
		EditorModule.getAddRootNode().addChild(node);
		UndoModule.saveNodeCreatedUndo( node );
		SelectionModule.setSelection(node);
	},

	createNodeWithMesh: function(mesh_name, options)
	{
		ResourcesManager.load(mesh_name, options, on_load);

		function on_load(mesh)
		{
			var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("mesh") );
			node.setMesh(mesh_name);
			node.material = new LS.StandardMaterial();
			EditorModule.getAddRootNode().addChild(node);
			UndoModule.saveNodeCreatedUndo(node);
			SelectionModule.setSelection(node);
		}
	},

	createCameraNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("camera") );
		node.addComponent( new Camera( LS.GlobalScene.current_camera ) );
		node.transform.lookAt( LS.GlobalScene.current_camera.eye, LS.GlobalScene.current_camera.center, LS.GlobalScene.current_camera.up );
		node.eye = vec3.create();
		node.center = vec3.fromValues(0,0,-1);
		EditorModule.getAddRootNode().addChild(node);
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);
	},

	createLightNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("light") );
		node.addComponent( new Light() );
		EditorModule.getAddRootNode().addChild(node);
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);
	},

	createPrimitive: function(info)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("primitive") );
		node.addComponent( new GeometricPrimitive(info));
		EditorModule.getAddRootNode().addChild(node);
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);
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
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);
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

	showCreateResource: function(resource, on_complete )
	{
		LiteGUI.prompt("Resource name", inner);

		function inner(name)
		{
			name = name.replace(/ /gi,"_"); //change spaces by underscores
			if(!resource.filename)
			{
				resource.id = null;
				resource.name = name;
				var filename = name + ".json";
				resource.filename = filename;
			}

			//save the resource info in resources
			LS.ResourcesManager.registerResource( resource.filename, resource ); 

			if(on_complete)
				on_complete( resource.filename, resource );
		}
	},

	showContextualNodeMenu: function(node, event)
	{
		if(!node || !node.getEditorActions)
			return;

		var actions = node.getEditorActions([]);
		if(!actions)
			return;

		var values = [];
		for(var i in actions)
			values.push({action:i, title: actions[i].title || i});

		if(!values.length)
			return;

		var menu = new LiteGUI.ContextualMenu( values, { event: event, title:"Node", callback: function(value) {
			if(!node)
				return;
			node.doEditorAction(value.action);
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

		var dialog = new LiteGUI.Dialog("dialog_maetrials", {title:"Materials", close: true, minimize: true, width: 300, height: 230, scroll: false, draggable: true});
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

		list_widget = widgets.addList(null, mats, { height: 140, callback: inner_selected });
		widgets.widgets_per_row = 1;

		widgets.addButton(null,"Add", { className:"big", callback: function()
		{ 
			if(!node || !selected )
			{
				if( on_complete )
					on_complete(null);
				dialog.close();
				return;
			}

			var material = new selected.ctor;
			node.material = material;
			//emit change event?

			dialog.close();
			RenderModule.requestFrame();
			if( on_complete )
				on_complete( material );
		}});

		dialog.add( widgets );
		dialog.adjustSize();

		function inner_selected(value)
		{
			selected = value;
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

		var dialog = new LiteGUI.Dialog("dialog_components", {title:"Components", close: true, minimize: true, width: 300, scroll: false, draggable: true});
		dialog.show('fade');

		var selected_component = null;
		var list_widget = null;

		var compos = [];
		for(var i in LS.Components)
			compos.push( { icon: EditorModule.icons_path + LS.Components[i].icon, ctor: LS.Components[i], name: LS.getClassName( LS.Components[i] ) });

		var filter = "";
		var widgets = new LiteGUI.Inspector();
		var filter_widget = widgets.addString("Filter", filter, { focus:true, immediate:true, callback: function(v) {
			filter = v.toLowerCase();
			compos = [];
			for(var i in LS.Components)
			{
				var name = LS.getClassName( LS.Components[i] );
				if(name.toLowerCase().indexOf(filter) != -1)
					compos.push( { icon: EditorModule.icons_path + LS.Components[i].icon, ctor: LS.Components[i], name: name });
			}
			list_widget.updateItems(compos);
		}});

		list_widget = widgets.addList(null, compos, { height: 240, callback: inner_selected });
		widgets.widgets_per_row = 1;

		widgets.addButton(null,"Add", { className:"big", callback: function() { 
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
			UndoModule.saveComponentCreatedUndo( compo );			

			dialog.close();
			if(on_complete)
				on_complete( compo );
			//EditorModule.inspectNode( root_instance, compo );
			RenderModule.requestFrame();
		}});

		dialog.content.appendChild(widgets.root);

		function inner_selected(value)
		{
			selected_component = value;
		}
	},

	showSelectResource: function(type, on_complete, on_load )
	{
		//FUNCTION REPLACED BY DRIVE MODULE
	},

	//shows a dialog to select a node
	showSelectNode: function(on_complete)
	{
		var dialog = new LiteGUI.Dialog("dialog_nodes", {title:"Scene nodes", close: true, minimize: true, width: 300, height: 310, scroll: false, draggable: true});
		dialog.show('fade');


		/*
		var tree = new SceneTreeWidget();
		dialog.add( tree );
		*/

		var scene = LS.GlobalScene;

		//*
		var selected_value = null;
		var nodes = [];
		for(var i = 1; i < scene._nodes.length; i++ ) //skip root node
		{
			var node = scene._nodes[i];
			nodes.push( { name: node._name, node: node } );
		}

		var widgets = new LiteGUI.Inspector();
		widgets.addList(null, nodes, { height: 140, callback: inner_selected });
		widgets.widgets_per_row = 1;
		widgets.addButton(null,"Select", { className:"big", callback: function() { 
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

		dialog.content.appendChild(widgets.root);
		dialog.adjustSize();

		function inner_selected(value)
		{
			selected_value = value;
		}
		//*/
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
		if(radius == 0)
			return;

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
		this.focusCameraInBoundingBox( bbox );
	},

	/* send keydown to current tab */
	globalKeyDown: function(e) {
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

	//key actions
	onKeyDown: function(e)
	{
		var keycode = e.keyCode;
		//console.log(keycode);
		switch( keycode )
		{
			case 32:
				if(e.ctrlKey)
					ConsoleModule.toggle();
				break;
			case 70: //F
				if(e.shiftKey)
					EditorModule.focusCameraInAll();
				else
					EditorModule.focusCameraInSelection();
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
				EditorModule.removeSelectedNode(); 
				return false;
				break;
			case 116: //F5
				if(EditorModule.settings.save_on_exit)
					SceneStorageModule.saveLocalScene("last", {}, Scene, SceneStorageModule.takeScreenshot(256,256) );

				if(EditorModule.settings.save_on_exit && EditorModule.settings.reload_on_start)
				{
					window.location.href = "?session=last";
					e.preventDefault();
					e.stopPropagation();
					return false;
				}
				break; //F6
			case 117: 
				console.log("recompiling shaders...");
				Shaders.reloadShaders(); 
				Scene.refresh();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; //F6
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
	},

	/***************/
	onShowSettingsPanel: function(name,widgets)
	{
		if(name != "editor") return;
		widgets.addFlags( EditorModule.settings );
	},
};

CORE.registerModule( EditorModule );


//EXTRA WIDGETS for the Inspector ************************************************

//to select a node, value must be a valid node identifier (not the node itself)
LiteGUI.Inspector.prototype.addNode = function(name, value, options)
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

//to select a resource
LiteGUI.Inspector.prototype.addResource = function(name,value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener( "change", function(e) { 
		if(e.target.value)
			LS.ResourcesManager.load(e.target.value);
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectResource("Mesh", inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
	});

	function inner_onselect(filename)
	{
		input.value = filename;
		LiteGUI.trigger( input, "change" );
	}

	this.tab_index += 1;
	this.append(element, options);
	return element;
}
LiteGUI.Inspector.widget_constructors["resource"] = "addResource";

//to select a texture
LiteGUI.Inspector.prototype.addTexture = function(name, value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[name] = value;

	var tex_name = value;
	if(value && value.texture)
		tex_name = value.texture;

	if(value && value.constructor === GL.Texture)
		tex_name = "@Texture";
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+tex_name+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		var v = e.target.value;
		if(v && v[0] != ":")
			LS.ResourcesManager.load(v);
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,v, options);
	});
	
	element.querySelector(".wcontent button").addEventListener("click", function(e) { 
		EditorModule.showSelectResource("Texture", inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
	});

	function inner_onselect( filename )
	{
		input.value = filename;
		LiteGUI.trigger( input, "change" );
		//$(element).find("input").val(filename).change();
	}

	element.addEventListener("drop", function(e){
		var path = e.dataTransfer.getData("res-fullpath");
		input.value = path;
		LiteGUI.trigger( input, "change" );

		e.preventDefault();
		e.stopPropagation();
		return false;
	}, true);

	this.tab_index += 1;
	this.append(element, options);
	return element;
}
LiteGUI.Inspector.widget_constructors["texture"] = "addTexture";

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
	element.options = options;

	input.addEventListener("change", function(e) { 
		var v = e.target.value;
		if(v && v[0] != ":")
			LS.ResourcesManager.load(v);
		value.texture = v;
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener("click", function(e) { 
		EditorModule.showTextureSamplerInfo( value, options );

		/*
		EditorModule.showSelectResource("Texture", inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
		*/
	});

	function inner_onselect( sampler )
	{
		input.value = sampler ? sampler.texture : "";
		LiteGUI.trigger( input, "change" );
		//$(element).find("input").val(filename).change();
	}

	this.tab_index += 1;
	this.append(element, options);
	return element;
}
LiteGUI.Inspector.widget_constructors["sampler"] = "addTextureSampler";


//to select a cubemap (texture)
LiteGUI.Inspector.prototype.addCubemap = LiteGUI.Inspector.prototype.addTexture;
LiteGUI.Inspector.widget_constructors["cubemap"] = "addCubemap";

//to select a mesh
LiteGUI.Inspector.prototype.addMesh = function(name,value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener( "change", function(e) { 
		if(e.target.value)
			LS.ResourcesManager.load(e.target.value);
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectResource( "Mesh", inner_onselect, inner_onload );
		if(options.callback_button)
			options.callback_button.call(element, input.value);
	});

	function inner_onselect(filename)
	{
		input.value = filename;
		LiteGUI.trigger( input, "change" );
	}

	function inner_onload( filename )
	{
		if(options.callback_load)
			options.callback_load.call( element, filename );
	}

	this.tab_index += 1;
	this.append(element, options);
	return element;
}
LiteGUI.Inspector.widget_constructors["mesh"] = "addMesh";

//to select a material
LiteGUI.Inspector.prototype.addMaterial = function(name,value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener( "change", inner_onchange );
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectResource("Material", inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, input.value );
	});

	function inner_onchange(e)
	{
		if(this.value)
			LS.ResourcesManager.load(this.value);
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,this.value, options);
	}

	function inner_onselect(filename)
	{
		input.value = filename;
		LiteGUI.trigger( input, "change" );
	}

	this.tab_index += 1;
	this.append(element, options);
	return element;
}
LiteGUI.Inspector.widget_constructors["material"] = "addMaterial";
LiteGUI.Inspector.widget_constructors["position"] = LiteGUI.Inspector.prototype.addVector3;

LiteGUI.Inspector.prototype.addLayers = function(name, value, options)
{
	var text = LS.GlobalScene.getLayerNames(value).join(",");

	options.callback = function(v){
		return LS.GlobalScene.getLayerNames(value).join(",");
	};
	options.callback_button = function() {
		EditorModule.showLayersEditor( value, function (layers,bit,v){
			value = layers;
			var text = LS.GlobalScene.getLayerNames(value).join(",");
			widget.setValue(text);
			if(options.callback)
				options.callback(layers,bit,v);
		});
	};

	var widget = this.addStringButton(name, text, options);
	return widget;
}
LiteGUI.Inspector.widget_constructors["layers"] = "addLayers";








