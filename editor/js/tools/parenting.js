var parentingNodeTool = {
	name: "parenting",
	description: "Drag to parent nodes",
	section: "foo",
	icon: "imgs/mini-icon-tree.png",

	state: null,

	mouse_pos: vec3.create(),

	renderEditor: function(camera)
	{
		if(!this.state) 
			return;

		var node = SelectionModule.getSelectedNode();
		if(!node) 
			return;
		if(!EditorView.mustRenderGizmos()) 
			return;
		if(!RenderModule.frame_updated) 
			return;

		var gizmo_model = ToolUtils.getSelectionMatrix();
		if(!gizmo_model)
			return null;

		//var pos = node.transform.getGlobalPosition( this.node_center );
		var pos = vec3.create();
		mat4.multiplyVec3( pos, gizmo_model, pos );

		//ToolUtils.prepareDrawing();
		var camera2D = ToolUtils.enableCamera2D(camera);
		var pos2D = camera.project(pos); //project

		if(pos2D[2] < 0) 
			return;

		pos2D[2] = 0;

		//now render the line
		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		LS.Draw.setColor([1,0,1,1]);

		LS.Draw.renderLines([pos2D, this.mouse_pos]);

		gl.enable(gl.DEPTH_TEST);
	},

	mousedown: function(e)
	{
		if (e.which != GL.LEFT_MOUSE_BUTTON)
			return;

		var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, ToolUtils.getCamera() );
		SelectionModule.setSelection( instance_info );
		if(!instance_info)
			return;

		this.mouse_pos.set([e.canvasx, e.canvasy, 0]);
		this.state = "dragging";
		return true;
	},

	mouseup: function(e)
	{
		this.state = null;
		var scene = LS.GlobalScene;
		scene.refresh();

		var parent = scene.root;
		var child = SelectionModule.getSelectedNode();
		if(!child) 
			return;

		var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, ToolUtils.getCamera(e) );
		if(instance_info)
		{
			var selection = SelectionModule.convertSelection( instance_info );
			parent = selection.node;
			if(!parent) 
				return;
		}

		if(parent == child)
			return;

		//save undo
		UndoModule.saveNodeParentingUndo( child );

		//change parent
		parent.addChild(child, null, true);
		return true;
	},

	mousemove: function(e)
	{
		if(!this.state)
			return;

		this.mouse_pos.set([e.canvasx, e.canvasy, 0]);
		LS.GlobalScene.refresh();
		return true;
	}
};

ToolsModule.registerTool( parentingNodeTool );

