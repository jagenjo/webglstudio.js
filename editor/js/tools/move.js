var moveTool = {
	name: "move",
	description: "Translate selection",
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
		var selection = SelectionModule.getSelection();
		if(!EditorView.mustRenderGizmos()) 
			return;

		ToolUtils.prepareDrawing();
		
		var gizmo_model = ToolUtils.getSelectionMatrix();
		if(!gizmo_model)
			return;

		var center = vec3.create();
		mat4.multiplyVec3( center, gizmo_model, center );

		var f = ToolUtils.computeDistanceFactor( center, camera );

		var scale = f * 0.15;

		var colorx = moveTool._on_top_of == "x" ? [1,1,1,1] : [1,0,0,1];
		var colory = moveTool._on_top_of == "y" ? [1,1,1,1] : [0,1,0,1];
		var colorz = moveTool._on_top_of == "z" ? [1,1,1,1] : [0,0,1,1];
		if( moveTool._on_top_of == "center" )
		{
			vec3.add(colorx, colorx,[1,1,1]);
			vec3.add(colory, colory,[1,1,1]);
			vec3.add(colorz, colorz,[1,1,1]);
		}

		var x_axis_end = vec3.create();
		var y_axis_end = vec3.create();
		var z_axis_end = vec3.create();

		gl.disable(gl.DEPTH_TEST);
		LS.Draw.setColor([1,1,1]);

		LS.Draw.push();
			LS.Draw.setMatrix(gizmo_model);

			mat4.multiplyVec3( x_axis_end, gizmo_model, [scale,0,0] );
			mat4.multiplyVec3( y_axis_end, gizmo_model, [0,scale,0] );
			mat4.multiplyVec3( z_axis_end, gizmo_model, [0,0,scale] );

			if( !this._freeze_axis )
			{
				this._center.set( center );
				this._x_axis_end.set( x_axis_end );
				this._y_axis_end.set( y_axis_end );
				this._z_axis_end.set( z_axis_end );
			}

			LS.Draw.renderLines( [[0,0,0],[scale,0,0],[0,0,0],[0,scale,0],[0,0,0],[0,0,scale]],
				[colorx,colorx,colory,colory,colorz,colorz]);
			
			LS.Draw.setColor(colorx);
			LS.Draw.push();
			LS.Draw.translate(scale,0,0);
			LS.Draw.rotate(-90,[0,0,1]);
			if(moveTool._on_top_of == "x")
				LS.Draw.scale(2,2,2);
			LS.Draw.renderCone(5*scale*0.005,15*scale*0.005,8);
			LS.Draw.pop();
			
			LS.Draw.setColor(colory);
			LS.Draw.push();
			LS.Draw.translate(0,scale,0);
			if(moveTool._on_top_of == "y")
				LS.Draw.scale(2,2,2);
			LS.Draw.renderCone(5*scale*0.005,15*scale*0.005,8);
			LS.Draw.pop();

			LS.Draw.setColor(colorz);
			LS.Draw.push();
			LS.Draw.translate(0,0,scale);
			LS.Draw.rotate(90,[1,0,0]);
			if(moveTool._on_top_of == "z")
				LS.Draw.scale(2,2,2);
			LS.Draw.renderCone(5*scale*0.005,15*scale*0.005,8);
			LS.Draw.pop();

			//plane gizmos
			gl.disable( gl.CULL_FACE );
			gl.enable( gl.BLEND );
			LS.Draw.setColor( moveTool._on_top_of == "xy" ? [1,1,1,0.5] : [0,0,1,0.25]);
			LS.Draw.renderPlane([scale * 0.15,scale * 0.15,0],[scale*0.14,scale*0.14]);
			LS.Draw.push();
			LS.Draw.rotate(90,1,0,0);
			LS.Draw.setColor( moveTool._on_top_of == "xz" ? [1,1,1,0.5] : [0,1,0,0.25]);
			LS.Draw.renderPlane([scale * 0.15,scale * 0.15,0],[scale*0.14,scale*0.14]);
			LS.Draw.pop();
			LS.Draw.push();
			LS.Draw.rotate(-90,0,1,0);
			LS.Draw.setColor( moveTool._on_top_of == "yz" ? [1,1,1,0.5] : [1,0,0,0.25]);
			LS.Draw.renderPlane([scale * 0.15,scale * 0.15,0],[scale*0.14,scale*0.14]);
			LS.Draw.pop();
			gl.enable( gl.CULL_FACE );
			gl.disable( gl.BLEND );

		LS.Draw.pop();

		gl.enable(gl.DEPTH_TEST);
	},

	mousedown: function(e)
	{
		if(!this.enabled) 
			return;

		if(e.which != GL.LEFT_MOUSE_BUTTON) 
			return;

		this._freeze_axis = true;

		var selection = SelectionModule.getSelection();
		if(!selection)
			return;

		if( e.metaKey || e.altKey )
		{
			this._on_top_of = null;
			return;
		}

		var node = selection.node;

		if( e.shiftKey && this._on_top_of )
		{
			var instances = SelectionModule.cloneSelectedInstance();
			if(instances)
				SelectionModule.setMultipleSelection(instances, false);
		}
		else
		{
			if( moveTool._on_top_of ) //action is going to be performed so we save undo...
			{
				var selection_info = SelectionModule.getSelection();
				//root component transforms do not affect Transform so we save the compo state
				if( selection_info && selection_info.node && selection_info.node === LS.GlobalScene.root )
					CORE.userAction("component_changed", selection_info.instance );
				else //save transform
					ToolUtils.saveSelectionTransformUndo();
			}
		}

		//get collision point with perpendicular plane
		var gizmo_model = ToolUtils.getSelectionMatrix();
		if(!gizmo_model)
			return;

		var center = vec3.create();
		mat4.multiplyVec3(center, gizmo_model, center);

		if(ToolUtils.testPerpendicularPlane(e.mousex, e.mousey, center, this._click_world_position))
			vec3.copy(this._debug_pos, this._click_world_position);

		//this._action = true;
	},

	mouseup: function(e) {
		this._action = false;

		if(!this.enabled) 
			return;
		if(e.which != GL.LEFT_MOUSE_BUTTON) 
			return;

		this._freeze_axis = false;
		EditorModule.refreshAttributes();
	},

	mousemove: function(e) 
	{
		if(!this.enabled) 
			return;

		LS.GlobalScene.refresh();

		var selection = SelectionModule.getSelection();
		if(!selection)
			return;

		var camera = ToolUtils.getCamera();
		//camera.updateMatrices();

		var gizmo_model = ToolUtils.getSelectionMatrix();
		if(!gizmo_model)
			return;

		var center = vec3.create();
		mat4.multiplyVec3( center,gizmo_model,center );

		var ray = camera.getRayInPixel( e.mousex, gl.canvas.height - e.mousey );
		ray.end = vec3.add( vec3.create(), ray.origin, vec3.scale(vec3.create(), ray.direction, 10000) );
		moveTool._last_ray = ray;

		if (e.dragging && e.which == GL.LEFT_MOUSE_BUTTON) {

			var f = 0.001 * ToolUtils.computeDistanceFactor(center);
			var delta = vec3.create();

			if(!moveTool._on_top_of)
			{
				return;
			}

			if(moveTool._on_top_of == "center") //parallel to camara
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
				var is_plane = false;
				
				if(moveTool._on_top_of == "y")
					axis = moveTool._y_axis_end;
				else if(moveTool._on_top_of == "z")
					axis = moveTool._z_axis_end;
				else if(moveTool._on_top_of == "x")
					axis = moveTool._x_axis_end;
				else if(moveTool._on_top_of == "xz")
				{
					is_plane = true;
					axis = moveTool._y_axis_end;
				}
				else if(moveTool._on_top_of == "yz")
				{
					is_plane = true;
					axis = moveTool._x_axis_end;
				}
				else if(moveTool._on_top_of == "xy")
				{
					is_plane = true;
					axis = moveTool._z_axis_end;
				}
			
				if( is_plane )
				{
					var axis = vec3.subtract( vec3.create(), axis, moveTool._center );
					vec3.normalize( axis, axis );
					geo.testRayPlane( ray.origin, ray.end, moveTool._center, axis, closest );
				}
				else
					geo.closestPointBetweenLines( ray.origin, ray.end, moveTool._center, axis, null, closest );

				vec3.subtract( delta, closest, moveTool._closest);
				vec3.copy( moveTool._closest, closest );
			}

			if(delta[0] == 0 && delta[1] == 0 && delta[2] == 0)
				return true;

			var T = mat4.setTranslation( mat4.create(), delta );

			ToolUtils.applyTransformMatrixToSelection(T);
			//node.transform.applyTransformMatrix(T, true);
			EditorModule.updateInspector();
			return true;
		}
		else //not dragging
		{
			var result = vec3.create();

			vec3.copy( moveTool._debug_pos, result );
			var radius = vec3.dist( moveTool._center, moveTool._x_axis_end);

			if ( geo.testRaySphere( ray.origin, ray.direction, moveTool._center, radius*1.1, result ) ) 
			{
				vec3.copy( moveTool._closest, result );
				if ( geo.testRaySphere( ray.origin, ray.direction, moveTool._center, radius*0.05, result ) ) 
					moveTool._on_top_of = "center";
				else
				{
					var close_to_x = geo.testRayCylinder( ray.origin, ray.direction, moveTool._center, moveTool._x_axis_end, radius*0.25, result );
					var close_to_y = geo.testRayCylinder( ray.origin, ray.direction, moveTool._center, moveTool._y_axis_end, radius*0.25, result );
					var close_to_z = geo.testRayCylinder( ray.origin, ray.direction, moveTool._center, moveTool._z_axis_end, radius*0.25, result );
					var axis_end = null;

					if(close_to_x)
					{
						if(close_to_y)
						{
							moveTool._on_top_of = "xy";
							axis_end = moveTool._z_axis_end;
						}
						else if(close_to_z)
						{
							moveTool._on_top_of = "xz";
							axis_end = moveTool._y_axis_end;
						}
						else
						{
							geo.closestPointBetweenLines( ray.origin, ray.end, moveTool._center, moveTool._x_axis_end, null, moveTool._closest );
							moveTool._on_top_of = "x";
						}
					}
					else if( close_to_y )
					{
						if( close_to_z )
						{
							axis_end = moveTool._x_axis_end;
							moveTool._on_top_of = "yz";
						}
						else
						{
							geo.closestPointBetweenLines( ray.origin, ray.end, moveTool._center, moveTool._y_axis_end, null, moveTool._closest );
							moveTool._on_top_of = "y";
						}
					
					}
					else if( close_to_z )
					{
						geo.closestPointBetweenLines( ray.origin, ray.end, moveTool._center, moveTool._z_axis_end, null, moveTool._closest );
						moveTool._on_top_of = "z";
					}
					else
						moveTool._on_top_of = null;

					if(axis_end)
					{
						var axis = vec3.create();
						vec3.subtract( axis, axis_end, moveTool._center );
						vec3.normalize( axis, axis );
						geo.testRayPlane( ray.origin, ray.end, moveTool._center, axis, moveTool._closest );
					}
				}
			}
			else
				moveTool._on_top_of = null;
			EditorModule.updateInspector();
			LS.GlobalScene.refresh();
		}
	},

	mousewheel: function(e)
	{
		if(!e.dragging) return;
		if(moveTool._on_top_of != "center") return;
		var selection = SelectionModule.getSelection();
		if(!selection)
			return;

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
		EditorModule.updateInspector();
		LS.GlobalScene.refresh();
		return true;		
	}
};
ToolsModule.registerTool( moveTool );


