var AnnotationModule = {
	init: function()
	{
		LiteGUI.menubar.add("Node/Add Annotation", { callback: function() { 
			if(!Scene.selected_node)
			{
				LiteGUI.alert("No node selected");
				return;
			}
			AnnotationModule.onAnnotateNode(Scene.selected_node);
		}});
	},	

	onAnnotateNode: function(node, text)
	{
		if(!node.getComponent( LS.Components.AnnotationComponent ))
		{
			var comp = new LS.Components.AnnotationComponent();
			node.addComponent(comp);
			comp.setStartTransform();
		}

		AnnotationModule.editAnnotation(node);
		if(window.EditorModule)
			EditorModule.refreshAttributes();
		LS.GlobalScene.refresh();
	},

	editAnnotation: function(node)
	{
		if(!node)
			return;

		var comp = node.getComponent( LS.Components.AnnotationComponent );
		if(!comp)
			return;

		text = comp.text;

		var dialog = new LiteGUI.Dialog("dialog_annotation", {title:"Annotation", close: true, minimize: true, width: 300, height: 180, scroll: false, draggable: true});
		dialog.show('fade');

		var textarea = document.createElement("textarea");
		textarea.className = "textfield";
		textarea.style.width = "100%";
		textarea.style.height = "120px";
		textarea.value = text;

		dialog.content.appendChild(textarea);

		$(textarea).change( function(e) {
			comp.text = this.value;
			if(window.EditorModule)
				EditorModule.refreshAttributes();
			LS.GlobalScene.refresh();
		});

		dialog.addButton("Delete", { className: "big", callback: function() { 
			node.removeComponent( comp );
			LS.GlobalScene.refresh();
			dialog.close(); 
		}});

		dialog.addButton("Save", { className: "big", callback: function() { 
			LS.GlobalScene.refresh();
			dialog.close(); 
		}});

		Scene.refresh();
	},

	showDialog: function(text, options)
	{
		options = options || {};

		var dialog = new LiteGUI.Dialog("dialog_annotation", {title:"Annotation", close: true, minimize: true, width: 300, height: 180, scroll: false, draggable: true});
		dialog.show('fade');

		var textarea = document.createElement("textarea");
		textarea.className = "textfield";
		textarea.style.width = "100%";
		textarea.style.height = "120px";
		textarea.value = text;

		dialog.content.appendChild(textarea);

		$(textarea).focus();

		if(options.on_close)
			$(dialog).bind("closed", function() { options.on_close(textarea.value); });

		if(options.on_delete)
			dialog.addButton("Delete", { className: "big", callback: function() { 
				options.on_delete(options);
				dialog.close(); 
			}});

		if(options.on_focus)
			dialog.addButton("Focus", { className: "big", callback: function() { 
				options.on_focus(options);
				dialog.close(); 
			}});

		dialog.addButton("Save", { className: "big", callback: function() { 
			if(options.on_close)
				options.on_close(textarea.value);
			dialog.close(); 
		}});

		LS.GlobalScene.refresh();
	},

	//component editor
	showAnnotationInfo: function(comp, attributes)
	{
		if(!comp) return;
		var node = comp._root;

		//var section = attributes.addSection("Light <span class='buttons'><button class='options_this'>Options</button></span>");
		$(attributes.current_section).find('.options_section').click(function(e) { 
			var menu = new LiteGUI.ContextualMenu(["Copy","Paste","Reset","Delete"], {component: comp, event: e, callback: EditorModule._onComponentOptionsSelect });
		});
		$(attributes.current_section).bind("wchange", function() { UndoModule.saveComponentChangeUndo(comp); });

		attributes.addTextarea("Node notes", comp.text, { callback: function(v) { comp.text = v; } });
		attributes.addTitle("Point annotations");

		var list = [];
		for(var i in comp.notes)
			list.push({name: comp.notes[i].text.substr(0,20), i: i, item: comp.notes[i] });

		attributes.addList(null, list, { callback: function(v) {
			AnnotationModule.focusInAnnotation(v.item);
			comp._selected = v.item;
		}});

		attributes.addButtons(null,["Edit","Delete"], function(v){
			if(!comp._selected)
				return;
	
			if(v == "Edit")
				AnnotationTool.editAnnotation(comp._selected, comp );
			else if(v == "Delete")
				comp.removeAnnotation( comp._selected );
			LS.GlobalScene.refresh();
			EditorModule.refreshAttributes();
		});
	},

	focusInAnnotation: function(item)
	{
		var camera = RenderModule.selected_camera;
		camera.setEye( item.cam_eye );
		camera.setCenter( item.cam_center );
		camera.fov = item.cam_fov;
		LS.GlobalScene.refresh();
	}
};

CORE.registerModule( AnnotationModule );

//****************************** ANNOTATION TOOL ***********************************

var AnnotationTool = {
	name: "annotate",
	description: "Annotate",
	section: "modify",
	icon: EditorModule.icons_path + "mini-icon-script.png",

	node_annotated: null,
	//in world coordinates of the object
	start_position: null,
	end_position: null,
	start_position2D: vec2.create(),

	mode: 0, //0: nothing, 1: dragging

	testRay: function(ray, node)
	{
		var mesh = node.getMesh();
		if(!mesh) return null;

		if(!mesh.octree)
			mesh.octree = new Octree( mesh );

		var model = node.transform.getGlobalMatrix();
		var inv = mat4.invert( mat4.create(), model );
		mat4.multiplyVec3(ray.start, inv, ray.start );
		mat4.rotateVec3(ray.direction, inv, ray.direction );
		var hit = mesh.octree.testRay( ray.start, ray.direction, 0.0, 10000 );
		if(hit) mat4.multiplyVec3( hit.pos, model, hit.pos); //to world coords
		return hit.pos;
	},

	render: function()
	{
		if(!RenderModule.frame_updated)
			return;

		var camera = RenderModule.selected_camera;
		LS.Draw.setCamera( camera );
		//Draw.setCameraPosition(camera.getEye());
		//Draw.setViewProjectionMatrix(Renderer._viewprojection_matrix);

		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		LS.Draw.setColor([0.33,0.874,0.56,1.0]);

		if(this.start_position && this.end_position)
		{
			LS.Draw.setColor( LS.Components.AnnotationComponent.editor_color);
			LS.Draw.setPointSize( 12 );
			LS.Draw.renderPoints( [this.end_position]);

			LS.Draw.setColor( [0,0,0,0.5] );
			LS.Draw.setPointSize( 10 );
			LS.Draw.renderPoints( [this.end_position]);

			LS.Draw.setColor( LS.Components.AnnotationComponent.editor_color );
			LS.Draw.renderLines([this.start_position, this.end_position],[[1,1,1,0.1],[1,1,1,1]]);
		}
		gl.disable(gl.BLEND);
	},

	mousedown: function(e)
	{
		if(!e.isButtonPressed(GL.LEFT_MOUSE_BUTTON))
			return;

		var camera = RenderModule.selected_camera;
		//check object
		var node = LS.Picking.getNodeAtCanvasPosition( e.canvasx, e.canvasy, camera );
		if(!node) 
			return;

		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var pos = this.testRay(ray, node);
		if(!pos)
			return;

		this.start_position2D.set([e.canvasx, e.canvasy]);

		this.node_annotated = node;
		this.start_position = pos;
		this.end_position = vec3.create();
		vec3.copy(this.end_position, pos);
		this.mode = 1;

		var comp = node.getComponent( LS.Components.AnnotationComponent );
		if(!comp)
		{
			comp = new LS.Components.AnnotationComponent();
			node.addComponent( comp );
			comp.setStartTransform();
		}

		LS.GlobalScene.refresh();
	},

	mousemove: function(e)
	{
		if(!this.mode) 
		{
			if(e.dragging)
			{
				cameraTool.onCameraDrag(e);
				LS.GlobalScene.refresh();
			}
			return;
		}
		
		var camera = RenderModule.selected_camera;
		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var front = camera.getLocalVector([0,0,1]);

		var node = AnnotationTool.node_annotated;
		if(node)
		{
			var model = node.transform.getGlobalMatrix();

			var result = vec3.create();
			if( geo.testRayPlane(ray.start, ray.direction, this.start_position, front, result ) )
			{
				vec3.copy( this.end_position, result );
			}
			LS.GlobalScene.refresh();
		}

		return true;
	},

	mouseup: function(e)
	{
		if(!this.mode)
			return;

		var endpos = vec2.fromValues( e.canvasx, e.canvasy );

		var dist = vec2.dist( AnnotationTool.start_position2D, endpos );
		if( dist < 10 ) //rare cases
		{
			this.start_position = null;
			this.end_position = null;
			this.node_annotated = null;
			this.mode = 0;
			Scene.refresh();
			return;
		}

		AnnotationModule.showDialog( "", { on_close: function(text) {
			var node = AnnotationTool.node_annotated;
			if(text && node)
			{
				var model = node.transform.getGlobalMatrix();
				var inv = mat4.invert( mat4.create(), model );
				mat4.multiplyVec3( AnnotationTool.start_position, inv, AnnotationTool.start_position );
				mat4.multiplyVec3( AnnotationTool.end_position, inv, AnnotationTool.end_position );

				AnnotationTool.addAnnotation( AnnotationTool.node_annotated, AnnotationTool.start_position, AnnotationTool.end_position, text );
			}
			AnnotationTool.start_position = null;
			AnnotationTool.end_position = null;
			AnnotationTool.node_annotated = null;
			LS.GlobalScene.refresh();
		}});

		this.mode = 0;
	},

	addAnnotation: function(node, start, end, text)
	{
		var comp = node.getComponent( LS.Components.AnnotationComponent );
		var camera = RenderModule.selected_camera;

		if(!comp)
		{
			comp = new LS.Components.AnnotationComponent();
			node.addComponent( comp );
			comp.setStartTransform();
		}
		var item = { start: start, end: end, text:text, cam_eye: camera.getEye(), cam_fov: camera.fov, cam_center: camera.getCenter() };
		comp.addAnnotation(item);
		EditorModule.refreshAttributes();
	},

	editAnnotation: function( annotation, comp )
	{
		AnnotationModule.showDialog( annotation.text, { on_close: function(text) {
			annotation.text = text;
			LS.GlobalScene.refresh();
		}});
	}
};

ToolsModule.registerTool(AnnotationTool);

/**************************/

LS.Components.AnnotationComponent.icon = "mini-icon-script.png";
LS.Components.AnnotationComponent["@inspector"] = AnnotationModule.showAnnotationInfo;