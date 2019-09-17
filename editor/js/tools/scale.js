var scaleNodeTool = {
	name: "scale",
	description: "Scale the node",
	section: "manipulate",
	icon: "imgs/mini-icon-scale.png",
	_debug_pos: vec3.create(),
	_center: vec3.create(),
	_x_axis_end: vec3.create(),
	_y_axis_end: vec3.create(),
	_z_axis_end: vec3.create(),
	_closest: vec3.create(),
	_on_top_of: null,
	_dist: 0,

	keyShortcut: 82,

	renderEditor: function(camera)
	{
		var node = SelectionModule.getSelectedNode();
		if(!node || !node.transform) 
			return;
		if(!EditorView.mustRenderGizmos())
			return;

		ToolUtils.prepareDrawing();

		var gizmo_model = ToolUtils.getSelectionMatrix();
		var center = vec3.create();
		mat4.multiplyVec3(center,gizmo_model,center);
		var f = ToolUtils.computeDistanceFactor(center);

		this._center.set( center );

		var scale = f *0.15;
		scaleNodeTool._radius = scale;

		var colorx = scaleNodeTool._on_top_of == "x" ? [1,0.9,0.9,1] : [1,0,0,1];
		var colory = scaleNodeTool._on_top_of == "y" ? [0.9,1,0.9,1] : [0,1,0,1];
		var colorz = scaleNodeTool._on_top_of == "z" ? [0.9,0.9,1,1] : [0,0,1,1];
		if( scaleNodeTool._on_top_of == "center" )
		{
			vec3.add(colorx, colorx,[0.4,0.4,0.4]);
			vec3.add(colory, colory,[0.4,0.4,0.4]);
			vec3.add(colorz, colorz,[0.4,0.4,0.4]);
		}

		gl.disable(gl.DEPTH_TEST);
		LS.Draw.setColor([0.5,0.5,0.5]);
		LS.Draw.push();
			LS.Draw.setMatrix(gizmo_model);

			mat4.multiplyVec3(scaleNodeTool._x_axis_end, gizmo_model, [scale,0,0] );
			mat4.multiplyVec3(scaleNodeTool._y_axis_end, gizmo_model, [0,scale,0] );
			mat4.multiplyVec3(scaleNodeTool._z_axis_end, gizmo_model, [0,0,scale] );

			LS.Draw.renderLines( [[0,0,0],[scale,0,0],[0,0,0],[0,scale,0],[0,0,0],[0,0,scale]]);

			LS.Draw.setColor(colorx);
			LS.Draw.translate([scale,0,0]);
			LS.Draw.renderSolidBox(scale*0.1,scale*0.1,scale*0.1);
			LS.Draw.setColor(colory);
			LS.Draw.translate([-scale,scale,0]);
			LS.Draw.renderSolidBox(scale*0.1,scale*0.1,scale*0.1);
			LS.Draw.setColor(colorz);
			LS.Draw.translate([0,-scale,scale]);
			LS.Draw.renderSolidBox(scale*0.1,scale*0.1,scale*0.1);
		LS.Draw.pop();

		gl.enable(gl.DEPTH_TEST);
	},

	mousedown: function(e) {
		if(!this.enabled || e.which != 1) return;

		var node = SelectionModule.getSelectedNode();
		if(!node || !node.transform) 
			return;
		ToolUtils.saveNodeTransformUndo(node);

		var gizmo_model = ToolUtils.getSelectionMatrix();
		mat4.multiplyVec3(this._center,gizmo_model,vec3.create());

		var camera = ToolUtils.getCamera();
		var pos2D = camera.project(this._center);
		var click_pos2D = vec3.fromValues(e.canvasx, e.canvasy,0);
		this._dist = vec3.distance( pos2D, click_pos2D );

	},

	mouseup: function(e) {
		if(!this.enabled)
			return;

		var selection_info = SelectionModule.getSelection();
		if( selection_info && selection_info.node && selection_info.node === LS.GlobalScene.root )
			CORE.afterUserAction("component_changed", selection_info.instance );
		else //save transform
			ToolUtils.afterSelectionTransform();

		EditorModule.inspect( LS.GlobalScene.selected_node );
	},

	mousemove: function(e) 
	{
		if(!this.enabled) return;


		var node = SelectionModule.getSelectedNode();
		if(!node || !node.transform) 
			return;
		var camera = ToolUtils.getCamera();

		var pos2D = camera.project(this._center);

		if (e.dragging && e.which == 1) {

			if(!scaleNodeTool._on_top_of)
			{
				LS.GlobalScene.refresh();
				return;
			}

			var f = 1+(e.deltax+e.deltay)*0.005;
			var click_pos2D = vec3.fromValues(e.canvasx, e.canvasy,0);
			var dist = vec3.distance( pos2D, click_pos2D );
			var scale_factor = dist / this._dist;
			this._dist = dist;
			if(scale_factor > 20) scale_factor = 20;
			if(scale_factor < 0.01) scale_factor = 0.01;

			if(scaleNodeTool._on_top_of == "center")
			{
				node.transform.scale(scale_factor,scale_factor,scale_factor);
			}
			else
			{
				if( scaleNodeTool._on_top_of == "x" )
					node.transform.scale( [scale_factor,1,1] );
				else if( scaleNodeTool._on_top_of == "y" )
					node.transform.scale( [1,scale_factor,1] );
				else if( scaleNodeTool._on_top_of == "z" )
					node.transform.scale( [1,1,scale_factor] );
			}

			LS.GlobalScene.refresh();
			return true;
		}
		else
		{
			var ray = camera.getRayInPixel( e.mousex, gl.canvas.height - e.mousey );
			var result = vec3.create();
			ray.end = vec3.add( vec3.create(), ray.origin, vec3.scale(vec3.create(), ray.direction, 10000 ) );

			var radius = scaleNodeTool._radius;

			var result = vec3.create();

			if ( geo.testRaySphere( ray.origin, ray.direction, scaleNodeTool._center, radius*1.1, result ) ) 
			{
				vec3.copy( scaleNodeTool._closest, result );

				if ( geo.testRaySphere( ray.origin, ray.direction, scaleNodeTool._center, radius*0.5, result ) ) 
					scaleNodeTool._on_top_of = "center";
				else if ( geo.testRaySphere( ray.origin, ray.direction, scaleNodeTool._x_axis_end, scaleNodeTool._radius * 0.1, result ) ) 
					scaleNodeTool._on_top_of = "x";
				else if ( geo.testRaySphere( ray.origin, ray.direction, scaleNodeTool._y_axis_end, scaleNodeTool._radius * 0.1, result ) ) 
					scaleNodeTool._on_top_of = "y";
				else if ( geo.testRaySphere( ray.origin, ray.direction, scaleNodeTool._z_axis_end, scaleNodeTool._radius * 0.1, result ) ) 
					scaleNodeTool._on_top_of = "z";
				else
					scaleNodeTool._on_top_of = null;
			}
			else
				scaleNodeTool._on_top_of = null;

			LS.GlobalScene.refresh();
		}
	}
};
ToolsModule.registerTool(scaleNodeTool);
