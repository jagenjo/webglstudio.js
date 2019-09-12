/*
	This module allows to change the tool used by the mouse when interacting with the viewport.
	properties:
	- name, description: info
	- icon: image
	- module: this will be the one receiving all the events, if no module is supplied the tool is used as the module
	- onEnable: callback when the tool is enabled
	- onDisable: callback when the tool is disabled
*/

var ToolsModule = {
	name: "tools",

	tool: "select",

	current_tool: null,
	background_tools: [],
	tools: {},
	buttons: {},

	coordinates_system: "object",
	center_system: "instances", //"node"

	_initialized: false,
	_active_camera: null, //camera under the mouse

	init: function() {

		for(var i in this.tools)
		{
			var tool = this.tools[i];
			if(tool.module && tool.module.onRegister)
			{
				tool.module.onRegister();
				tool.module.onRegister = null; //UGLY
			}
		}

		//initGUI
		//place to put all the icons of the tools (really? just use the events system)
		RenderModule.canvas_manager.addWidget(this);
		this.createToolbar();

		//render tools guizmos
		//LEvent.bind( LS.Renderer, "afterRenderScene", this.renderView.bind(this) ); //renderHelpers
	},

	registerTool: function(tool)
	{
		if( this.tools[ tool.name ] )
			console.warn("there is already a tool with this name: ", tool.name );
		this.tools[ tool.name ] = tool;
	},

	registerButton: function( button )
	{
		if( this.buttons[ button.name ] )
			console.warn("there is already a button with this name: ", button.name );
		this.buttons[ button.name ] = button;
	},

	// a tool that is always active (used for selection tool)
	addBackgroundTool: function( tool )
	{
		this.background_tools.push( tool );
	},

	keydown: function(e)
	{
		for(var i in ToolsModule.tools)
		{
			if(ToolsModule.tools[i].keyShortcut == e.keyCode)
			{
				ToolsModule.enableTool( ToolsModule.tools[i].name );
				break;
			}
		}
	},

	enableTool: function(name)
	{
		if( this.current_tool ) {

			//avoid to reactivate same tool
			if( this.current_tool.name == name )
			{
				if( this.current_tool.onClick )
					this.current_tool.onClick();
				return;
			}

			if( this.current_tool.module )
			{
				if(!this.current_tool.keep_module)
					RenderModule.canvas_manager.removeWidget(this.current_tool.module);
				this.current_tool.module.enabled = false;
			}
			else if(!this.current_tool.keep_module)
				RenderModule.canvas_manager.removeWidget(this.current_tool);
			this.current_tool.enabled = false;
			if (this.current_tool.onDisable)
				this.current_tool.onDisable();
		}

		var enabled = document.querySelectorAll("#canvas-tools .tool-button.enabled");
		for(var i = 0; i < enabled.length; i++)
			enabled[i].classList.remove("enabled");

		var old_tool = this.current_tool;
		this.current_tool = null;
		var tool = this.tools[name];
		if(!tool)
			return;

		this.current_tool = tool;
		if( this.current_tool.onClick )
			this.current_tool.onClick();

		if(tool.module)
		{ 
			RenderModule.canvas_manager.addWidget(tool.module);
			tool.module.enabled = true;
		}
		else RenderModule.canvas_manager.addWidget(tool);
		this.current_tool.enabled = true;

		if (this.current_tool.onEnable)
			this.current_tool.onEnable();

		if(old_tool && old_tool.inspect && InterfaceModule.inspector_widget.instance == old_tool)
			EditorModule.inspect( SelectionModule.getSelectedNode() );

		LiteGUI.trigger( this, "tool_enabled", this.current_tool );
		LS.GlobalScene.refresh();
	},

	showToolProperties: function( tool_name )
	{
		var tool = this.tools[ tool_name ];
		if(!tool)
			return;

		this.enableTool( tool_name );

		if(!tool.inspect)
			return;

		EditorModule.inspect( tool );
	},

	showButtonProperties: function( button_name )
	{
		var button = this.buttons[ button_name ];
		if(!button || !button.inspect)
			return;
		EditorModule.inspect( button );
	},

	//*
	//every frame
	render: function()
	{
		if(!RenderModule.frame_updated)
			return;

		if(!this._active_camera)
			return;
		var camera = this._active_camera;
		LS.Renderer.enableCamera( camera ); //sets viewport, update matrices and set Draw

		for(var i in this.tools)
		{
			var tool = this.tools[i];
			if(tool.renderEditorAlways)
				tool.renderEditorAlways( camera );
		}

		if (this.current_tool)
			this.renderView(null, camera);
	},
	//*/

	renderView: function(e, camera)
	{
		if (!this.current_tool)
			return;

		if( this.current_tool.renderEditor )
			this.current_tool.renderEditor( camera );
	},

	//called from CanvasManager on every input event
	//used mostly to allow Editor GUI Stuff
	//Here because it is the upmost widget in the canvas...
	onevent: function(e)
	{
		//if(e.type == "mousedown")
		//	console.log("down");

		var blocked = false;

		//in case we have editor gui widgets we need to update the events
		if( LEvent.hasBind( LS.GlobalScene, "renderEditorGUI" ) )
			blocked = RenderModule.passEventToLiteScene(e);
		if(blocked) //something happened
			LS.GlobalScene.requestFrame();

		//in case the user script grabs the input
		if(!blocked)
		{
			var r = null;
			var viewport = RenderModule.active_viewport;
			e.layout = viewport;
			r = LEvent.trigger( LS.GlobalScene, "editorEvent", e );//, false, true );
			if( r === true ) //event intercepted by script
				blocked = true;
		}

		return blocked;
	},

	mouseevent: function(e)
	{
		if(this.background_tools.length)
		{
			for(var i = 0; i < this.background_tools.length; ++i)
			{
				var tool = this.background_tools[i];
				if(tool[e.type])
					if( tool[e.type](e) )
						break;
			}
		}
	},

	mousedown: function(e)
	{
		return this.mouseevent(e);
	},

	mouseup: function(e)
	{
		return this.mouseevent(e);
	},

	mousemove: function(e)
	{
		//when the mouse is not dragging we update active camera
		if(!e.dragging)
		{
			//active camera is the camera which viewport is below the mouse
			var viewport = RenderModule.getViewportUnderMouse(e);
			if(!viewport)
				return;
			var camera = viewport.camera;

			if( this._active_camera == camera )
				return;

			this._active_camera = camera;
			LS.GlobalScene.refresh();
		}
		else
		{
			return this.mouseevent(e);
		}
	},

	createToolbar: function()
	{
		//in case they exist
		LiteGUI.remove("#canvas-tools");
		LiteGUI.remove("#canvas-buttons");

		var root = LiteGUI.getById("visor");
		if(!root)
		{
			console.error("No #visor element found");
			return;
		}

		root.appendChild( LiteGUI.createElement("div","canvas-tools .ineditor" ));
		root.appendChild( LiteGUI.createElement("div","canvas-buttons .ineditor" ));

		for(var i in this.tools)
		{
			var tool = this.tools[i];
			if(tool.display == false)
				continue;
			this.addToolButton(tool);
		}

		for(var i in this.buttons)
		{
			var button = this.buttons[i];
			if(button.display == false)
				continue;
			this.addStateButton(button);
		}
	},

	addToolButton: function( tool )
	{
		var root = document.getElementById("canvas-tools");

		var element = this.createButton( tool, root );
		element.className += " tool-" + tool.name + " " + (tool.enabled ? "enabled":"");

		if(!tool.className)
			tool.className = "tool";
		element.addEventListener("click", function(e){
			ToolsModule.enableTool( this.data );
			LS.GlobalScene.refresh();
			LiteGUI.removeClass( null, "#canvas-tools .enabled", "enabled");
			this.classList.add("enabled");
		});

		element.addEventListener("contextmenu", function(e) { 
			if(e.button != 2) //right button
				return false;
			e.preventDefault(); 
			ToolsModule.showToolProperties( this.data );
			return false;
		} );

		element.addEventListener("dblclick", function(e) { 
			e.preventDefault(); 
			ToolsModule.showToolProperties( this.data );
			return false;
		} );

	},

	addStateButton: function( button )
	{
		var root = document.getElementById("canvas-buttons");

		var element = this.createButton( button, root );
		element.className += " tool-" + button.name + " " + (button.enabled ? "enabled":"");
		element.addEventListener("click", inner_onClick );

		function inner_onClick( e )
		{
			if(button.combo)
			{
				var section_name = "tool-section-" + button.section;
				LiteGUI.removeClass( root, "." + section_name + " .tool-button", "enabled");
			}

			if(!button.callback)
				return;

			var ret = button.callback(e);
			if( ret !== undefined )
			{
				if(ret)
					this.classList.add("enabled");
				else
					this.classList.remove("enabled");
			}
			else if(!button.combo)
				this.classList.toggle("enabled");
			else
				this.classList.add("enabled");
			LS.GlobalScene.refresh();

			e.preventDefault();
			return false;
		}

		element.addEventListener("contextmenu", function(e) { 
			if(e.button != 2) //right button
				return false;
			e.preventDefault(); 
			ToolsModule.showButtonProperties( this.data );
			return false;
		});
	},

	createButton: function( button, root )
	{
		var element = document.createElement("div");
		element.className = "tool-button";
		element.data = button.name;
		if (button.icon) {
			element.style.backgroundImage = "url('" + button.icon + "')";
		}

		if(button.description)
			element.title = button.description;

		if(!button.section)
			button.section = "general";

		var section = this.getSection( button.section, root );
		if( !section )
			section = this.createSection( button.section, root );

		section.appendChild( element );
		return element;
	},

	getSection: function( name, root )
	{
		return root.querySelector(".tool-section-" + name);
	},

	createSection: function( name, root )
	{
		var section = root.querySelector(".tool-section-" + name);
		if( section )
			return section;

		var section_element = document.createElement("div");
		section_element.className = "tool-section tool-section-" + name;
		root.appendChild( section_element );
		return section_element;
	}
};

CORE.registerModule( ToolsModule );

//************* TOOLS *******************
var ToolUtils = {
	click_point: vec3.create(),

	getCamera: function(e)
	{
		if(!e)
			return ToolsModule._active_camera || RenderModule.camera;

		var x = e.canvasx;
		var y = e.canvasy;

		var cameras = RenderModule.getLayoutCameras();
		var camera = cameras[0];
		for(var i = cameras.length-1; i >= 0; --i)
		{
			if( cameras[i].isPoint2DInCameraViewport( x,y ) )
			{
				camera = cameras[i];
				break;
			}
		}
		return camera;
	},

	getCamera2D: function()
	{
		if(!this.camera_2d)
			this.camera_2d = new LS.Camera({eye:[0,0,0],center:[0,0,-1]});
		return this.camera_2d;
	},


	prepareDrawing: function()
	{
		var camera = this.getCamera();
		this.camera_eye = camera.getEye();
		this.camera_front = camera.getFront();
		this.camera_top = camera.getLocalVector([0,1,0]);
		this.camera_right = camera.getLocalVector([1,0,0]);
	},

	enableCamera2D: function(camera)
	{
		var camera2d = this.getCamera2D();

		if(camera) //copy viewport
			camera2d._viewport.set( camera._viewport );

		var viewport = camera2d.getLocalViewport(); //should be the same as gl.viewport_data

		camera2d.setOrthographic( viewport[0], viewport[0] + viewport[2], viewport[1], viewport[1] + viewport[3], -1, 1);
		camera2d.updateMatrices();
		LS.Draw.setViewProjectionMatrix( camera2d._view_matrix, camera2d._projection_matrix, camera2d._viewprojection_matrix );
		
		return camera2d;
	},

	getSelectionMatrix: function()
	{
		var m = SelectionModule.getSelectionTransform();

		if(m && ToolsModule.coordinates_system == 'world')
		{
			var pos = vec3.create();
			mat4.multiplyVec3( pos, m, pos );
			mat4.identity( m );
			mat4.setTranslation( m, pos );
		}

		return m;
	},

	/*
	//returns the matrix for the selected gizmo
	getNodeGizmoMatrix: function(node)
	{
		if(!node) return null;
		var model = null;
		var center = null;
		var camera = this.getCamera();
		
		if(node.transform)
		{
			center = node.transform.getGlobalPosition();
			if(ToolsModule.coordinates_system == 'object')
				model = node.transform.getMatrixWithoutScale();
			else if(ToolsModule.coordinates_system == 'world')
				model = node.transform.getMatrixWithoutRotation();
			else if(ToolsModule.coordinates_system == 'view')
			{
				var up = this.camera_up;
				model = mat4.lookAt(mat4.create(), center, vec3.subtract( vec3.create(), center, this.camera_eye ), up );
				mat4.invert(model, model);
			}
		}
		else
			return mat4.create();
		return model;
	},
	*/

	applyTransformToSelection: function(transform, center, node)
	{
		SelectionModule.applyTransformToSelection(transform, center, node);
	},

	applyTransformMatrixToSelection: function(matrix, center, node)
	{
		SelectionModule.applyTransformMatrixToSelection( matrix, center, node);
	},

	//special case, when transforming a bone you want to preserve the distance with the parent
	applyTransformMatrixToBone: function(matrix)
	{
		var scene = LS.GlobalScene;

		var node = scene.selected_node;
		var parent = node.parentNode;

		var pos = node.transform.getGlobalPosition();
		var parent_model = parent.transform.getGlobalMatrix();
		var parent_pos = parent.transform.getGlobalPosition();

		var end_pos = mat4.multiplyVec3( vec3.create(), matrix, pos );

		var A = vec3.sub( vec3.create(), pos, parent_pos );
		var B = vec3.sub( vec3.create(), end_pos, parent_pos );
		vec3.normalize(A,A);
		vec3.normalize(B,B);

		var axis = vec3.cross( vec3.create(), A, B );
		vec3.normalize(axis,axis);
		var angle = Math.acos( Math.clamp( vec3.dot(A,B), -1,1) );
		if( Math.abs(angle) < 0.00001 )
			return;

		var Q = quat.setAxisAngle( quat.create(), axis, angle);
		var R = mat4.fromQuat( mat4.create(), Q );

		this.applyTransformMatrixToSelection(R, parent_pos, parent );
		//parent.transform.applyTransformMatrix(R, true);
		scene.refresh();
	},
	
	//test the collision point of a ray passing a pixel against a perpendicular plane passing through center
	testPerpendicularPlane: function(x,y, center, result, camera)
	{
		camera = camera || this.getCamera();
		result = result || vec3.create();

		var ray = camera.getRayInPixel( x, gl.canvas.height - y );
		if(!ray) //could happen if near is too small
			return;
		//ray.end = vec3.add( vec3.create(), ray.origin, vec3.scale(vec3.create(), ray.direction, 10000) );

		//test against plane
		var front = camera.getFront( this.camera_front );
		if( geo.testRayPlane( ray.origin, ray.direction, center, front, result ) )
			return true;
		return false;
	},

	computeRotationBetweenPoints: function( center, pointA, pointB, axis, reverse, scalar )
	{
		scalar = scalar || 1;
		var A = vec3.sub( vec3.create(), pointA, center );
		var B = vec3.sub( vec3.create(), pointB, center );
		vec3.normalize(A,A);
		vec3.normalize(B,B);
		var AcrossB = vec3.cross(vec3.create(),A,B);

		var AdotB = vec3.dot(A,B); //clamp
		//var angle = -Math.acos( AdotB );
		var angle = -Math.acos( Math.clamp( vec3.dot(A,B), -1,1) );
		if(angle)
		{
			if(!axis)
				axis = AcrossB;
			vec3.normalize(axis, axis);
			if( reverse && vec3.dot(AcrossB, axis) < 0 )
				angle *= -1;
			angle *= scalar;
			if(!isNaN(angle) && angle)
				return quat.setAxisAngle( quat.create(), axis, angle );
		}

		return quat.create();
	},

	computeDistanceFactor: function(v, camera)
	{
		camera = camera || RenderModule.camera;
		return Math.tan(camera.fov * DEG2RAD) * vec3.dist( v, camera.getEye() );
	},

	//useful generic methods
	saveNodeTransformUndo: function(node)
	{
		if(!node || node.constructor !== LS.SceneNode)
		{
			console.error("saveNodeTransformUndo node must be SceneNode");
			return;
		}

		CORE.userAction("node_transform",node);
		//UndoModule.saveNodeTransformUndo(node);
	},

	saveSelectionTransformUndo: function()
	{
		CORE.userAction("nodes_transform", SelectionModule.getSelectedNodes() );
		//UndoModule.saveNodeTransformUndo(node);
		//UndoModule.saveNodesTransformUndo( SelectionModule.getSelectedNodes() );
	},

	afterSelectionTransform: function()
	{
		CORE.afterUserAction("nodes_transform", SelectionModule.getSelectedNodes() );
	},

	//test if a ray collides circle
	testCircle: (function(){ 
		var temp = vec3.create();
		return function(ray, axis, center, radius, result, tolerance )
		{
			tolerance = tolerance || 0.1;
			//test with the plane containing the circle
			if( geo.testRayPlane( ray.origin, ray.direction, center, axis, result ) )
			{
				var dist = vec3.dist( result, center );
				var diff = vec3.subtract( temp, result, center );
				vec3.scale(diff, diff, 1 / dist); //normalize?
				if( Math.abs(radius - dist) < radius * tolerance && vec3.dot(diff, ray.direction) < 0.0 )
				{
					result.set( diff );
					vec3.scale( result, result, radius );
					return true;
				}
			}
			return false;
		}
	})()
};

var notoolButton = {
	name: "notool-button",
	description: "Deselect any tool selected",
	icon: "imgs/mini-icon-circle.png",
	section: "main",

	callback: function()
	{
		ToolsModule.enableTool(null);
		return false;
	}
};

ToolsModule.registerButton(notoolButton);

