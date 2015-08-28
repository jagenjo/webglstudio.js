var moveNodeTool = {
	name: "move",
	description: "Translate the node",
	section: "manipulate",
	icon: "imgs/mini-icon-gizmo.png",
	keyShortcut: 87, //W

	_action: true,

	_debug_pos: vec3.create(),
	_x_axis_end: vec3.create(),
	_y_axis_end: vec3.create(),
	_z_axis_end: vec3.create(),
	_center: vec3.create(),
	_closest: vec3.create(),
	_on_top_of: null,
	_click_world_position: vec3.create(),

	renderEditor: function(camera)
	{
		var node = SelectionModule.getSelectedNode();
		if(!node)
			return;

		if(!EditorView.mustRenderGizmos()) 
			return;

		ToolUtils.prepareDrawing();
		

		var gizmo_model = ToolUtils.getSelectionMatrix();
		if(!gizmo_model)
			return;

		var center = vec3.create();
		mat4.multiplyVec3(center,gizmo_model,center);

		var f = ToolUtils.computeDistanceFactor(center, camera);
		vec3.copy(moveNodeTool._center, center);

		var scale = f *0.15;

		var colorx = moveNodeTool._on_top_of == "x" ? [1,1,1,1] : [1,0,0,1];
		var colory = moveNodeTool._on_top_of == "y" ? [1,1,1,1] : [0,1,0,1];
		var colorz = moveNodeTool._on_top_of == "z" ? [1,1,1,1] : [0,0,1,1];
		if( moveNodeTool._on_top_of == "center" )
		{
			vec3.add(colorx, colorx,[1,1,1]);
			vec3.add(colory, colory,[1,1,1]);
			vec3.add(colorz, colorz,[1,1,1]);
		}


		gl.disable(gl.DEPTH_TEST);
		Draw.setColor([1,1,1]);

		Draw.push();
			Draw.setMatrix(gizmo_model);

			mat4.multiplyVec3(moveNodeTool._x_axis_end, gizmo_model, [scale,0,0] );
			mat4.multiplyVec3(moveNodeTool._y_axis_end, gizmo_model, [0,scale,0] );
			mat4.multiplyVec3(moveNodeTool._z_axis_end, gizmo_model, [0,0,scale] );

			Draw.renderLines( [[0,0,0],[scale,0,0],[0,0,0],[0,scale,0],[0,0,0],[0,0,scale]],
				[colorx,colorx,colory,colory,colorz,colorz]);
			
			Draw.setColor(colorx);
			Draw.push();
			Draw.translate(scale,0,0);
			Draw.rotate(-90,[0,0,1]);
			if(moveNodeTool._on_top_of == "x")
				Draw.scale(2,2,2);
			Draw.renderCone(5*scale*0.005,15*scale*0.005,8);
			Draw.pop();
			
			Draw.setColor(colory);
			Draw.push();
			Draw.translate(0,scale,0);
			if(moveNodeTool._on_top_of == "y")
				Draw.scale(2,2,2);
			Draw.renderCone(5*scale*0.005,15*scale*0.005,8);
			Draw.pop();

			Draw.setColor(colorz);
			Draw.push();
			Draw.translate(0,0,scale);
			Draw.rotate(90,[1,0,0]);
			if(moveNodeTool._on_top_of == "z")
				Draw.scale(2,2,2);
			Draw.renderCone(5*scale*0.005,15*scale*0.005,8);
			Draw.pop();

		Draw.pop();

		gl.enable(gl.DEPTH_TEST);
	},

	mousedown: function(e) {
		if(!this.enabled) 
			return;
		if(e.which != GL.LEFT_MOUSE_BUTTON) 
			return;

		var node = SelectionModule.getSelectedNode();
		if(!node) 
			return;

		if( e.shiftKey && this._on_top_of )
		{
			var instances = SelectionModule.cloneSelectedInstance();
			if(instances)
				SelectionModule.setMultipleSelection(instances, false);
		}
		else
		{
			if(node.transform)
				ToolUtils.saveNodeTransformUndo(node);
		}

		//get collision point with perpendicular plane
		var gizmo_model = ToolUtils.getSelectionMatrix();
		if(!gizmo_model)
			return;

		var center = vec3.create();
		mat4.multiplyVec3(center,gizmo_model,center);

		if(ToolUtils.testPerpendicularPlane(e.mousex, e.mousey, center, this._click_world_position))
			vec3.copy(this._debug_pos, this._click_world_position);

		//this._action = true;
	},

	mouseup: function(e) {
		var action = this._action;
		this._action = false;

		if(!this.enabled) 
			return;
		if(e.which != GL.LEFT_MOUSE_BUTTON) 
			return;

		EditorModule.refreshAttributes();
	},

	mousemove: function(e) 
	{
		if(!this.enabled) 
			return;

		LS.GlobalScene.refresh();

		var node = SelectionModule.getSelectedNode();
		if(!node) 
			return;

		var camera = ToolUtils.getCamera();
		//camera.updateMatrices();

		if(!node) 
			return;
		var gizmo_model = ToolUtils.getSelectionMatrix();
		if(!gizmo_model)
			return;

		var center = vec3.create();
		mat4.multiplyVec3(center,gizmo_model,center);

		var ray = camera.getRayInPixel( e.mousex, gl.canvas.height - e.mousey );
		ray.end = vec3.add( vec3.create(), ray.start, vec3.scale(vec3.create(), ray.direction, 10000) );
		moveNodeTool._last_ray = ray;

		if (e.dragging && e.which == GL.LEFT_MOUSE_BUTTON) {

			var f = 0.001 * ToolUtils.computeDistanceFactor(center);
			var delta = vec3.create();

			if(!moveNodeTool._on_top_of)
			{
				return;
			}

			if(moveNodeTool._on_top_of == "center") //parallel to camara
			{
				var current_position = vec3.create();		
				ToolUtils.testPerpendicularPlane(e.mousex, e.mousey, center, current_position );
				vec3.sub(delta, current_position, this._click_world_position);
				vec3.copy(this._click_world_position, current_position);
				vec3.copy(this._debug_pos, this._click_world_position);

				//mat4.rotateVec3(delta, model, [e.deltax * f,-e.deltay * f,0] );
				//node.transform.translate(delta[0],delta[1],delta[2]);
			}
			else //using axis
			{
				var closest = vec3.create();
				var axis = null;
				
				if(moveNodeTool._on_top_of == "y")
					axis = moveNodeTool._y_axis_end;
				else if(moveNodeTool._on_top_of == "z")
					axis = moveNodeTool._z_axis_end;
				else
					axis = moveNodeTool._x_axis_end;
			
				geo.closestPointBetweenLines( ray.start, ray.end, moveNodeTool._center, axis, null, closest );
				//trace( vec3.toArray(moveNodeTool._closest));
				//trace( vec3.toArray(closest));
				vec3.subtract(delta, closest, moveNodeTool._closest);
				vec3.copy( moveNodeTool._closest, closest );
				/*
				if(use_world)
					node.transform.translate(delta[0],delta[1],delta[2]);
				else
					node.transform.translateLocal(delta[0],delta[1],delta[2]);
				*/
			}

			if(delta[0] == 0 && delta[1] == 0 && delta[2] == 0)
				return true;

			var T = mat4.setTranslation( mat4.create(), delta );

			ToolUtils.applyTransformMatrixToSelection(T);
			//node.transform.applyTransformMatrix(T, true);

			return true;
		}
		else
		{
			var result = vec3.create();

			vec3.copy( moveNodeTool._debug_pos, result );
			var radius = vec3.dist( moveNodeTool._center, moveNodeTool._x_axis_end);

			if ( geo.testRaySphere( ray.start, ray.direction, moveNodeTool._center, radius*1.1, result ) ) 
			{
				vec3.copy( moveNodeTool._closest, result );
				if ( geo.testRaySphere( ray.start, ray.direction, moveNodeTool._center, radius*0.5, result ) ) 
					moveNodeTool._on_top_of = "center";
				else if( geo.testRayCylinder( ray.start, ray.direction, moveNodeTool._center, moveNodeTool._x_axis_end, radius*0.1, result ) )
				{
					geo.closestPointBetweenLines( ray.start, ray.end, moveNodeTool._center, moveNodeTool._x_axis_end, null, moveNodeTool._closest );
					//vec3.set(moveNodeTool._closest, moveNodeTool._debug_pos );
					moveNodeTool._on_top_of = "x";
				}
				else if( geo.testRayCylinder( ray.start, ray.direction, moveNodeTool._center, moveNodeTool._y_axis_end, radius*0.1, result ) )
				{
					geo.closestPointBetweenLines( ray.start, ray.end, moveNodeTool._center, moveNodeTool._y_axis_end, null, moveNodeTool._closest );
					moveNodeTool._on_top_of = "y";
				}
				else if( geo.testRayCylinder( ray.start, ray.direction, moveNodeTool._center, moveNodeTool._z_axis_end, radius*0.1, result ) )
				{
					geo.closestPointBetweenLines( ray.start, ray.end, moveNodeTool._center, moveNodeTool._z_axis_end, null, moveNodeTool._closest );
					moveNodeTool._on_top_of = "z";
				}
				else
					moveNodeTool._on_top_of = null;
			}
			else
				moveNodeTool._on_top_of = null;

			Scene.refresh();
		}
	},

	mousewheel: function(e)
	{
		if(!e.dragging) return;
		if(moveNodeTool._on_top_of != "center") return;
		var node = SelectionModule.getSelectedNode();
		if(!node) return;

		var camera = ToolUtils.getCamera();
		var eye = camera.getEye();
		var gizmo_model = ToolUtils.getSelectionMatrix();
		var center = vec3.create();
		mat4.multiplyVec3(center,gizmo_model,center);

		var delta = vec3.sub(vec3.create(), eye, center );

		vec3.scale(delta,delta, e.wheel < 0 ? 0.05 : -0.05 );
		var T = mat4.setTranslation( mat4.create(), delta );
		//node.transform.applyTransformMatrix(T, true);
		ToolUtils.applyTransformMatrixToSelection(T);

		vec3.add( this._click_world_position, this._click_world_position, delta );

		Scene.refresh();
		return true;		
	}
};
ToolsModule.registerTool(moveNodeTool);


