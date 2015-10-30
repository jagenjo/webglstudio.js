var rotateNodeTool = {
	name: "rotate",
	description: "Rotate the node",
	section: "manipulate",
	icon: "imgs/mini-icon-rotate.png",

	_debug_pos: vec3.create(),
	_x_axis_normal: vec3.create(),
	_y_axis_normal: vec3.create(),
	_z_axis_normal: vec3.create(),
	_x_axis_end: vec3.create(),
	_y_axis_end: vec3.create(),
	_z_axis_end: vec3.create(),
	_center: vec3.create(),
	_closest: vec3.create(),
	_closest_ring: vec3.create(),

	_radius: 1,
	_dist_factor: 1,
	_on_top_of: null,

	keyShortcut: 69, //E


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
		this._dist_factor = f;
		vec3.copy(rotateNodeTool._center, center);

		var scale = f * 0.15;

		var colorx = rotateNodeTool._on_top_of == "x" ? [1,0.9,0.9,1] : [1,0,0,0.8];
		var colory = rotateNodeTool._on_top_of == "y" ? [0.9,1,0.9,1] : [0,1,0,0.8];
		var colorz = rotateNodeTool._on_top_of == "z" ? [0.9,0.9,1,1] : [0,0,1,0.8];
		var colorf = rotateNodeTool._on_top_of == "f" ? [1,1,1,1] : [1,0.5,0,0.5];
		if( rotateNodeTool._on_top_of == "center" )
		{
			vec3.add(colorx, colorx,[0.4,0.4,0.4]);
			vec3.add(colory, colory,[0.4,0.4,0.4]);
			vec3.add(colorz, colorz,[0.4,0.4,0.4]);
		}

		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.enable(gl.CULL_FACE);
		Draw.push();
			Draw.setMatrix(gizmo_model);

			var radius = scale*0.8;
			rotateNodeTool._radius = radius;

			//save axis to reuse them in mousemove
			mat4.multiplyVec3(rotateNodeTool._x_axis_end, gizmo_model, [radius,0,0] );
			mat4.multiplyVec3(rotateNodeTool._y_axis_end, gizmo_model, [0,radius,0] );
			mat4.multiplyVec3(rotateNodeTool._z_axis_end, gizmo_model, [0,0,radius] );

			//three axis lines
			Draw.setColor([1,1,1]);
			Draw.renderLines( [[0,0,0],[radius,0,0],[0,0,0],[0,radius,0],[0,0,0],[0,0,radius]],
				[colorz,colorz,colorx,colorx,colory,colory]);

			Draw.setColor(colorx);
			//Draw.renderCylinder(radius, 0.05*scale, 40);
			Draw.renderCircle( radius, 40, true);
			mat4.rotateVec3( rotateNodeTool._x_axis_normal, Draw.model_matrix, [0,1,0] );

			Draw.setColor(colory);
			Draw.rotate(90,[1,0,0]);
			Draw.renderCircle( radius, 40, true);
			mat4.rotateVec3( rotateNodeTool._y_axis_normal, Draw.model_matrix, [0,1,0] );
			//Draw.renderCylinder(radius, 0.05*scale, 40);

			Draw.setColor(colorz);
			Draw.rotate(90,[0,0,1]);
			Draw.renderCircle( radius, 40, true);
			mat4.rotateVec3( rotateNodeTool._z_axis_normal, Draw.model_matrix, [0,1,0] );
			//Draw.renderCylinder(radius, 0.05*scale, 40);

			//draw interior sphere
			Draw.setColor([0,0,0,0.2]);
			Draw.push();
			Draw.scale(radius * 0.99);
			Draw.renderMesh( EditorView.sphere_mesh, gl.TRIANGLES );
			Draw.pop();

			//*
			Draw.setColor(colorf);
			mat4.fromTranslationFrontTop(gizmo_model, center, ToolUtils.camera_front, ToolUtils.camera_top );
			Draw.setMatrix(gizmo_model);
			Draw.renderCircle(radius * 1.2, 40 );
			//*/

		Draw.pop();

		/* DEBUG
		Draw.setPointSize( 20 );
		Draw.setColor([1,0.5,1,0.8]);
		Draw.renderRoundPoints( this._closest_ring );
		*/

		gl.enable(gl.DEPTH_TEST);
	},

	mousedown: function(e) {
		if(!this.enabled) return;
		if(e.which != GL.LEFT_MOUSE_BUTTON)
			return;

		var node = SelectionModule.getSelectedNode();
		if(!node || !node.transform) 
			return;
		ToolUtils.saveNodeTransformUndo(node);
	},

	mouseup: function(e) {
		if(!this.enabled) 
			return;

		var node = SelectionModule.getSelectedNode();
		EditorModule.inspectNode(node);
	},

	mousemove: function(e) 
	{
		if(!this.enabled) 
			return;
		var node = SelectionModule.getSelectedNode();
		if(!node || !node.transform) 
			return;
		if(e.deltax == 0 && e.deltay == 0)
			return;

		var camera = ToolUtils.getCamera();
		var model = node.transform.getGlobalMatrix();
		var center = node.transform.getGlobalPosition();
		//mat4.rotateVec3( center, model, center);

		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var rotateSpeed = 1;
		var result = vec3.create();

		LS.GlobalScene.refresh();

		//is mouse clicked
		if (e.dragging && e.which == GL.LEFT_MOUSE_BUTTON)
		{
			if(!this._on_top_of)
				return;

			var Q = quat.create();
			var xaxis = this._x_axis_normal;
			var yaxis = this._y_axis_normal;
			var zaxis = this._z_axis_normal;

			//orient vectors locally
			/*
			var rot = node.transform.getGlobalRotation();
			vec3.transformQuat( xaxis, xaxis, rot);
			vec3.transformQuat( yaxis, yaxis, rot);
			vec3.transformQuat( zaxis, zaxis, rot);
			*/

			

			if(this._on_top_of == "center")
			{
				geo.testRaySphere( ray.start, ray.direction, this._center, this._radius*1.1, result );
				quat.copy(Q, ToolUtils.computeRotationBetweenPoints(center, this._closest, result) );
				vec3.copy(this._closest,result);
				//node.transform.rotate(e.deltax * rotateSpeed, rotateNodeTool._x_axis_normal );
				//node.transform.rotate(e.deltay * rotateSpeed, rotateNodeTool._z_axis_normal );
			}
			else if( this._on_top_of == "x" )
			{
				//compute angle between closest_ring and current point
				geo.testRayPlane( ray.start, ray.direction, this._center, xaxis, result );
				quat.copy(Q, ToolUtils.computeRotationBetweenPoints(center, this._closest_ring, result) );
				vec3.copy(this._closest_ring,result);
			}
			else if( this._on_top_of == "y" )
			{
				//compute angle between closest_ring and current point
				geo.testRayPlane( ray.start, ray.direction, this._center, yaxis, result );
				quat.copy(Q, ToolUtils.computeRotationBetweenPoints(center, this._closest_ring, result) );
				vec3.copy(this._closest_ring,result);
			}
			else if( this._on_top_of == "z" )
			{
				//compute angle between closest_ring and current point
				geo.testRayPlane( ray.start, ray.direction, this._center, zaxis, result );
				quat.copy(Q, ToolUtils.computeRotationBetweenPoints(center, this._closest_ring, result) );
				vec3.copy(this._closest_ring,result);
			}
			else if( this._on_top_of == "f" )
			{
				//FIX THIS
				geo.testRayPlane( ray.start, ray.direction, center, ToolUtils.camera_front, result );
				//closest should be projected to the plane
				var point = geo.projectPointOnPlane(this._closest, center, ToolUtils.camera_front );
				quat.copy( Q, ToolUtils.computeRotationBetweenPoints( center, point, result ) );
				vec3.copy( this._closest, result );
			}

			quat.normalize(Q,Q);
			var R = mat4.fromQuat( mat4.create(), Q );
			/*
			var T = mat4.setTranslation(mat4.create(), center);
			var T2 = mat4.setTranslation(mat4.create(), [-center[0],-center[1],-center[2]]);
			var M = mat4.multiply(mat4.create(),R,T2);
			mat4.multiply(M,T,M);
			node.transform.applyTransformMatrix(M, true);
			*/

			ToolUtils.applyTransformMatrixToSelection(R, center);

			return true;
		}
		else //mouse moving without clicking: test collision
		{
			if ( geo.testRaySphere( ray.start, ray.direction, this._center, this._radius*1.2, result ) ) 
			{
				vec3.copy( this._closest, result );
				if ( geo.testRaySphere( ray.start, ray.direction, this._center, this._radius*1.1, result ) ) 
				{
					vec3.copy( this._closest, result );
					if( ToolUtils.testCircle(ray, this._x_axis_normal, this._center, this._radius, result) )
					{
						this._closest_ring.set( result );
						this._on_top_of = "x";
					}
					else if( ToolUtils.testCircle(ray, this._y_axis_normal, this._center, this._radius,  result) )
					{
						this._closest_ring.set( result );
						this._on_top_of = "y";
					}
					else if( ToolUtils.testCircle(ray, this._z_axis_normal, this._center, this._radius,  result) )
					{
						this._closest_ring.set( result );
						this._on_top_of = "z";
					}
					else
						this._on_top_of = "center";

					vec3.copy( this._debug_pos, result );
				}
				else
					this._on_top_of = "f";
			}
			else
				this._on_top_of = null;
		}
	}
};
ToolsModule.registerTool(rotateNodeTool);



