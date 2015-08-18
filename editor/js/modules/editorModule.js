/* This module handles the tools to edit the scene */

var EditorModule = { 
	name: "editor",
	icons_path:  "imgs/",

	//to call when editing a node
	node_editors: [],
	material_editors: {},

	inspector_instance: null, //the instance showing its attributes (could be a node, the scene, a tool, ...)
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
	
		LEvent.bind( scene, "selected_node_changed", function(e,node) { 
			EditorModule.inspectNode( scene.selected_node );
		});

		LEvent.bind( scene, "scene_loaded", function(e) { 
			EditorModule.inspectNode( scene.root );
		});

		$(LiteGUI).bind("undo", function() {
			RenderModule.requestFrame();
		});

		SelectionModule.setSelection( scene.root );

		document.addEventListener("keydown", this.globalKeyDown.bind(this), false );

		this.registerCommands();
	},

	registerCommands: function()
	{
		this.commands["createNode"] = this.createNullNode.bind(this);
		this.commands["createLight"] = this.createLightNode.bind(this);
		this.commands["createCube"] = this.createPrimitive.bind(this, { geometry: GeometricPrimitive.CUBE, size: 10, subdivisions: 10 } );
		this.commands["createSphere"] = this.createPrimitive.bind(this, { geometry: GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 } );
		this.commands["addComponent"] = function(cmd, tokens) { 
			EditorModule.addComponentToNode( Scene.selected_node, tokens[1] );
			EditorModule.inspectNode( Scene.selected_node );
		};
		this.commands["selectNode"] = function(cmd, tokens) { 
			var node = Scene.getNode( tokens[1] );
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
	},

	createMenuEntries: function()
	{
		var mainmenu = LiteGUI.menubar;
		//buttons

		mainmenu.add("Scene/Settings", { callback: function() { 
			EditorModule.inspectNode( LS.GlobalScene.root ); 
		}});

		mainmenu.add("Edit/Undo", { callback: function() { LiteGUI.doUndo(); }});
		mainmenu.separator("Edit");

		mainmenu.add("Edit/Copy Node", { callback: function() { EditorModule.copyNodeToClipboard( Scene.selected_node ); }});
		mainmenu.add("Edit/Paste Node", { callback: function() { EditorModule.pasteNodeFromClipboard(); }});
		mainmenu.add("Edit/Clone Node", { callback: function() { EditorModule.cloneNode( Scene.selected_node ); }});
		mainmenu.add("Edit/Delete Node", { callback: function() { EditorModule.removeSelectedNode(); }});
		mainmenu.add("Edit/Focus on node", { callback: function() { cameraTool.setFocusPointOnNode( Scene.selected_node, true ); }});
		mainmenu.add("Edit/Paste component", { callback: function() { EditorModule.pasteComponentInNode( Scene.selected_node ); }});

		mainmenu.add("Node/Create node", { callback: function() { EditorModule.createNullNode(); }});
		mainmenu.add("Node/Create camera", { callback: function() { EditorModule.createCameraNode(); }});
		mainmenu.add("Node/Create light", { callback: function() { EditorModule.createLightNode(); }} );
		//mainmenu.separator("Node");
		mainmenu.add("Node/Primitive/Plane", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.PLANE, size: 10, subdivisions: 10, align_z: true}); }});
		mainmenu.add("Node/Primitive/Cube", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.CUBE, size: 10, subdivisions: 10 }); }});
		mainmenu.add("Node/Primitive/Sphere", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Primitive/Hemisphere", { callback: function() { EditorModule.createPrimitive( { geometry: GeometricPrimitive.HEMISPHERE, size: 10, subdivisions: 32 }); }});

		mainmenu.add("Node/Add Component", { callback: function() { EditorModule.showAddComponentToNode(); }} );
		mainmenu.add("Node/Add Material", { callback: function() { EditorModule.showAddMaterialToNode(); }} );
		mainmenu.add("Node/Add Script", { callback: function() { 
			CodingModule.onNewScript(); 
			EditorModule.refreshAttributes();
		}});

		mainmenu.add("View/Default material properties", { callback: function() { EditorModule.inspectInDialog( LS.Renderer.default_material ); }});

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
		if(!this.inspector_instance)
			return;

		switch( this.inspector_instance.constructor )
		{

			case LS.SceneNode: this.inspectNode(this.inspector_instance); break;
			case Object: 
			case Array: this.inspectObjects( this.inspector_instance ); break;
			default:
				this.inspectObject(this.inspector_instance); break;
		}
	},

	inspectObjects: function(objects, inspector)
	{
		inspector = inspector || this.inspector;

		this.inspector.clear();
		this.inspector_instance = objects;

		for(var i = 0; i < objects.length; i++)
		{
			var object = objects[i];
			if(!object)
				continue;

			if( LS.isClassComponent( object.constructor ) )
				this.showComponentInterface( object, inspector );
			else
				this.showContainerFields(object, inspector);
		}
	},

	inspectObject: function(object, inspector)
	{
		this.inspectObjects([object],inspector);
		this.inspector_instance = object;
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

		var dialog = new LiteGUI.Dialog(id, {title: title, parent:"#visor", close: true, minimize: true, width: 300, height: height, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');
		dialog.setPosition(50 + (Math.random() * 10)|0,50 + (Math.random() * 10)|0);

		var inspector = new LiteGUI.Inspector(null,{ name_width: "40%" });
		var object_class = object.constructor;
		var editor = object_class["@inspector"];

		//create area
		var icon = "";
		if(object_class.icon)
			icon = "<img src='"+ this.icons_path + object_class.icon+"' class='icon'/>";
		//var section = inspector.addSection(icon + name + " <span class='buttons'><button class='options_section'>Options</button></span>");

		if(editor)
			editor.call(this, object, inspector );
		else
			inspector.inspectInstance( object );

		inspector.onchange = function()
		{
			RenderModule.requestFrame();
		}

		dialog.content.appendChild(inspector.root);
	},

	inspectNode: function(node, component_to_focus )
	{
		var inspector = this.inspector;

		this.inspector.clear();
		this.inspector_instance = node;

		if(!node)
			return;

		if(node == LS.GlobalScene.root) //main node use an special editor
		{
			this.showSceneInfo(node, this.inspector);
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

					if( !node.setName(v) )
						return node._name;

					EditorModule.saveNodeUndo(node);
				}});

			inspector.addString("UId", node.uid, { disabled: true });

			if(node.className != null)
				inspector.addString("class", node.className, { callback: function(v) { node.className = v; } });
			if(node.flags && node.flags.visible != null)
				inspector.addCheckbox("visible", node.visible, { pretitle: AnimationModule.getKeyframeCode( node, "visible"), callback: function(v) { node.visible = v; } });

			inspector.addStringButton("layers", node.getLayers().join(","), { callback_button: function() {
				EditorModule.showLayersEditor( node );
			}});

			//special node editors
			for(var i in this.node_editors)
				this.node_editors[i](node, inspector);
		}

		//components
		this.showComponentsInterfaces(node,inspector);

		//flags
		inspector.addSection("Extras", { collapsed: true });
		if(node.flags)
		{
			inspector.addTitle("Flags");
			inspector.widgets_per_row = 2;
			inspector.addFlags(node.flags, {seen_by_camera:true, seen_by_reflections:true, depth_test: true, depth_write: true, ignore_lights: false, ignore_fog: false, selectable: true});
			inspector.widgets_per_row = 1;
		}

		inspector.addSection();

		//final buttons
		inspector.addButton(null,"Add component", { callback: function(v) { 
			EditorModule.showAddComponentToNode();
		}});

		inspector.addButtons(null,["Add Script","Add Graph"], { callback: function(v) { 
			if(v == "Add Script")
				CodingModule.onNewScript( node );
			else if(v == "Add Graph")
				GraphModule.onNewGraph( node );
			EditorModule.refreshAttributes();
				
		}});

		if(component_to_focus)
			inspector.scrollTo( component_to_focus.uid.substr(1) );

		AnimationModule.attachKeyframesBehaviour( inspector );
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

		section.querySelector(".wsectiontitle").addEventListener("contextmenu", (function(e) { 
			if(e.button != 2) //right button
				return false;
			inner_showActions(e);
			e.preventDefault(); 
			return false;
		}).bind(this));

		//checkbox for enable/disable
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
			EditorModule.saveComponentUndo(component);
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

			var menu = new LiteGUI.ContextualMenu( actions, { event: event, callback: function(value) {

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
		widgets.addString("UID", node.uid, { disabled: true }  );
		widgets.addCheckbox("Visible", node.visible, function(v){ node.flags.visible = v; });
		widgets.addButtons(null,["Close"], function(v){
			if(v == "Close")
				dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();
	},

	showLayersEditor: function( instance )
	{
		var node = instance._root ? instance._root : instance;
		var scene = node.scene || LS.GlobalScene;

		var dialog = new LiteGUI.Dialog("layers_editor",{ title:"Layers editor", width: 300, height: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		if(instance.constructor === LS.SceneNode)
			widgets.addString("Node", node.name, { disabled: true });
		else
			widgets.addString("Component", LS.getObjectClassName(instance), { disabled: true });

		widgets.widgets_per_row = 2;
		for(var i = 0; i < 32; ++i)
		{
			widgets.addString(null, scene.layer_names[i] || ("layer"+i), { layer: i, callback: function(v) {
				scene.layer_names[ this.options.layer ] = v;
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}});

			widgets.addCheckbox( null, node.isInLayer(i), { layer: i, callback: function(v){
				instance.setLayer( this.options.layer, v );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
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

		widgets.addButtons(null,["Copy Component","Close"], function(v){
			if(v == "Close")
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

	// UNDO and COPY&PASTE
	saveSceneUndo: function()
	{
		LiteGUI.addUndoStep({ 
			data: JSON.stringify( LS.GlobalScene.serialize() ), //stringify to save some space
			callback: function(d) {
				var selected_node = LS.GlobalScene.selected_node ? LS.GlobalScene.selected_node.uid : null;
				LS.GlobalScene.clear();
				LS.GlobalScene.configure( JSON.parse(d) );
				SelectionModule.setSelection( LS.GlobalScene.getNode( selected_node ) );
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeUndo: function(node)
	{
		LiteGUI.addUndoStep({ 
			data: { node:node, info: JSON.stringify(node.serialize()) }, //stringify to save some space
			callback: function(d) {
				d.node.configure(JSON.parse(d.info));
				EditorModule.inspectNode(node);
				RenderModule.requestFrame();
			}
		});
	},	

	saveComponentUndo: function(component)
	{
		LiteGUI.addUndoStep({ 
			data: { component:component, info: JSON.stringify(component.serialize()) }, //stringify to save some space
			callback: function(d) {
				d.component.configure( JSON.parse(d.info) );
				$(component).trigger("changed");
				EditorModule.inspectNode( LS.GlobalScene.selected_node);
				RenderModule.requestFrame();
			}
		});
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
		this.saveComponentUndo(component);
		var data = component.serialize();
		data._object_type = LS.getObjectClassName(component);
		LiteGUI.toClipboard( data );
	},

	pasteComponentFromClipboard: function(component) {
		this.saveComponentUndo(component);
		var data = LiteGUI.getClipboard();
		if( !data ) return;
		component.configure( data ); 
		$(component).trigger("changed");
		EditorModule.inspectNode(Scene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	pasteComponentInNode: function(node)
	{
		this.saveNodeUndo(node);
		var data = LiteGUI.getClipboard();
		if(!data || !data._object_type) return;

		var component = new window[data._object_type]();
		node.addComponent(component);
		component.configure(data); 
		EditorModule.inspectNode(node); //update interface
		RenderModule.requestFrame();
	},	

	resetNodeComponent: function(component) {
		this.saveComponentUndo(component);
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
		if(!node) return;

		LiteGUI.addUndoStep({ 
			data: { node:component._root, component: LS.getObjectClassName(component), info: JSON.stringify(component.serialize()) }, //stringify to save some space
			callback: function(d) {
				d.node.addComponent( new window[d.component](JSON.parse(d.info)) );
				$(d.node).trigger("changed");
				EditorModule.inspectNode(Scene.selected_node);
				RenderModule.requestFrame();
			}
		});

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
			LiteGUI.addUndoStep({ 
				data: { node: new_node.uid },
				callback: function(d) {
					var node = Scene.getNode(d.node);
					if(node && node._parentNode)
						node._parentNode.removeChild(node);
				}
			});

		return new_node;
	},

	//interaction
	removeSelectedNode: function()
	{
		SelectionModule.removeSelectedInstance();
	},

	pasteComponent: function(node)
	{

	},

	addUndoCreation: function(node)
	{
		LiteGUI.addUndoStep({ 
			data: node,
			callback: function(d) {
				LS.GlobalScene.root.removeChild(d);
			}
		});
	},

	// returns the root node
	getAddRootNode: function()
	{
		return LS.GlobalScene.root; //Scene.selected_node
	},

	createNullNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("node") );
		node.material = null;
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.addUndoCreation(node);
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
			EditorModule.addUndoCreation(node);
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
		EditorModule.addUndoCreation(node);
		SelectionModule.setSelection(node);
	},

	createLightNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("light") );
		node.addComponent( new Light() );
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.addUndoCreation(node);
		SelectionModule.setSelection(node);
	},

	createPrimitive: function(info)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("primitive") );
		node.addComponent( new GeometricPrimitive(info));
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.addUndoCreation(node);
		SelectionModule.setSelection(node);
	},

	addMaterialToNode: function()
	{
		if(!Scene.selected_node || LS.GlobalScene.selected_node.material) return;
		Scene.selected_node.material = new Material();
		EditorModule.inspectNode( LS.GlobalScene.selected_node );
		RenderModule.requestFrame();
	},

	addComponentToNode: function( node, component_name )
	{
		if(!node)
			return;
		if(!LS.Components[ component_name ] )
			return;

		node.addComponent( new LS.Components[component_name ]() );
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

		var actions = node.getEditorActions();
		if(!actions)
			return;

		var values = [];
		for(var i in actions)
			values.push({action:i, title: actions[i].title || i});

		var menu = new LiteGUI.ContextualMenu( values, { event: event, callback: function(value) {
			if(!node)
				return;
			node.doEditorAction(value.action);
		}});
	},

	showAddMaterialToNode: function()
	{
		if(!EditorModule.inspector_instance)
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

		widgets.addButton(null,"Add", { className:"big", callback: function() { 
			if(!EditorModule.inspector_instance || !selected )
			{
				dialog.close();
				return;
			}

			var material = new selected.ctor;
			EditorModule.inspector_instance.material = material;

			dialog.close();
			EditorModule.inspectNode( EditorModule.inspector_instance );
			RenderModule.requestFrame();
		}});

		dialog.add( widgets );
		dialog.adjustSize();

		function inner_selected(value)
		{
			selected = value;
		}
	},

	showAddComponentToNode: function( root_instance )
	{
		root_instance = root_instance || EditorModule.inspector_instance;

		if(!root_instance)
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
				return;
			}

			if(!root_instance.addComponent)
				return;

			var compo = new selected_component.ctor;
			root_instance.addComponent( compo );
			dialog.close();
			EditorModule.inspectNode( root_instance, compo );
			RenderModule.requestFrame();
		}});

		dialog.content.appendChild(widgets.root);

		function inner_selected(value)
		{
			selected_component = value;
		}
	},

	showSelectResource: function(type, on_complete)
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
		LS.GlobalScene.refresh();
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
		//console.log(e.keyCode);
		switch(e.keyCode)
		{
			case 32:
				if(e.ctrlKey)
					ConsoleModule.toggle();
				break;
			case 70: //F
				EditorModule.centerCameraInSelection();
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
		}
	},

	/***************/
	onShowSettingsPanel: function(name,widgets)
	{
		if(name != "editor") return;
		widgets.addFlags( EditorModule.settings );
	},
};

LiteGUI.registerModule( EditorModule );


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
		EditorModule.showSelectResource("Mesh", inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, input.value);
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










