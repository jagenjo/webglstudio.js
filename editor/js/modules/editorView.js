// Used to render all the gizmos in the 3D environment
// It behaves as a module.

var EditorView = {

	name: "view",

	settings: {
		render_grid: true, //floor grid
		render_axis: false, //floor grid
		render_component: true, //render component gizmos
		render_icons: true, //component icons
		render_all_components: false, //render gizmos even for non selected components
		grid_scale: 1.0,
		grid_alpha: 0.5,
		grid_plane: "xz",
		render_null_nodes: true,
		render_aabb: false,
		render_tree: false,
		render_skeletons: true,
		render_names: false,
		render_height: true
	},

	render_debug_info: true,
	render_gizmos: true,
	render_helpers: true, //icons, grid, cones, etc

	init: function()
	{
		if(!gl)
			return;

		this.debug_render = new LS.DebugRender(); //in charge of rendering debug info in the scene
		RenderModule.canvas_manager.addWidget(this);

		LEvent.bind( LS.Renderer, "renderHelpers", this.renderView.bind(this));
		LEvent.bind( LS.Renderer, "renderPicking", this.renderPicking.bind(this));
	},

	onShowSettingsPanel: function(name,widgets)
	{
		if(name != "editor")
			return;

		widgets.addTitle("View");
		widgets.inspectInstance( this.settings );

		//RenderModule.requestFrame();
	},

	//called from CanvasManager, used to render screen space gizmos
	render: function()
	{
		if(!this.mustRenderHelpers())
			return;
		
		for(var i in RenderModule.viewports)
			RenderModule.viewports[i].render();
	},

	//called from LS.Renderer after the event afterRenderScene is triggered
	//renders the gizmos that belong to world space
	renderView: function(e, camera)
	{
		if(LS.Renderer._current_scene != LS.GlobalScene)
			return;

		if(this.mustRenderHelpers())
			this.renderEditor( camera );
	},

	mustRenderGizmos: function()
	{
		//if(RenderModule.frame_updated && this.render_debug_info && !RenderModule.render_settings.ingame && (!Renderer.color_rendertarget || !Renderer.render_fx) )
		//	return true;

		if(this.render_gizmos && !RenderModule.render_settings.in_player && RenderModule.frame_updated)
			return true;
		return false;
	},	

	mustRenderHelpers: function()
	{
		if(this.render_helpers && !RenderModule.render_settings.in_player && RenderModule.frame_updated && !RenderModule.view_from_scene_cameras)
			return true;
		return false;
	},

	sendToLayoutGizmos: function(name, params)
	{
		for(var i = 0; i < RenderModule.viewports.length; i++)
		{
			var viewport = RenderModule.viewports[i];
			if(!viewport.gizmos || !viewport.gizmos.length )
				continue;

			for(var j = 0; j < viewport.gizmos.length; j++)
			{
				var gizmo = viewport.gizmos[j];
				var r = null;
				if(gizmo[name])
					r = gizmo[name].apply(gizmo, params);
				if(r === true)
					return true; //break
			}
		}
	},

	update: function(seconds)
	{
		this.sendToLayoutGizmos("update",[seconds]);
	},

	mousedown: function(e)
	{
		//check if the mouse is between layouts
		//TODO

		var r = this.sendToLayoutGizmos("mousedown",[e]);
		return r;
	},

	mousemove: function(e)
	{
		var r = this.sendToLayoutGizmos("mousemove",[e]);

		return r;
	},

	mouseup: function(e)
	{
		var r = this.sendToLayoutGizmos("mouseup",[e]);
		if(r)
			return r;

		if(e.button == 2 && e.click_time < 200)
		{
			var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, ToolUtils.getCamera() );
			var instance = instance_info;
			if(instance_info && instance_info.instance)
				instance = instance_info.instance;
			this._canvas_event = e; //we store the event because we may need it
			EditorModule.showCanvasContextMenu( instance, e );
			return true;
		}
	},

	mousewheel: function(e)
	{
		return this.sendToLayoutGizmos("mousewheel",[e]);
	},

	renderEditor: function( camera )
	{
		for(var i in this.settings)
			this.debug_render.settings[i] = this.settings[i];

		this.debug_render.render( camera, SelectionModule.isSelected.bind( SelectionModule ) );

		gl.depthFunc( gl.LEQUAL );

		LEvent.trigger( LS.GlobalScene, "renderEditor" );

		gl.depthFunc( gl.LESS );
		gl.viewport(0,0,gl.canvas.width,gl.canvas.height); //??
	},

	//used for picking just points **************************************************
	_picking_points: [], //used to collect all points to render during picking

	addPickingPoint: function( position, size, info )
	{
		size = size || 5.0;
		var color = LS.Picking.getNextPickingColor( info );
		this._picking_points.push([position,color,size]);
	},

	renderPicking: function(e, mouse_pos)
	{
		//cannot pick what is hidden
		if(!this.render_helpers)
			return;

		gl.disable( gl.BLEND );

		var camera = RenderModule.getActiveCamera();
		LS.Draw.setCamera( camera );
		LS.Draw.setPointSize( 20 );

		var ray = null;
		if(mouse_pos)
		{
			ray = camera.getRayInPixel( mouse_pos[0], mouse_pos[1] );
			ray.end = vec3.add( vec3.create(), ray.origin, vec3.scale(vec3.create(), ray.direction, 10000 ) );
		}

		//Nodes
		for(var i = 0, l = LS.GlobalScene._nodes.length; i < l; ++i)
		{
			var node = LS.GlobalScene._nodes[i];

			if(!node.visible)
				continue;

			//nodes with special pickings?
			if(node.renderPicking)
				node.renderPicking(ray);

			if(node.transform)
			{
				var pos = vec3.create();
				mat4.multiplyVec3(pos, node.transform.getGlobalMatrixRef(), pos); //create a new one to store them
				if( this.settings.render_null_nodes )
					this.addPickingPoint( pos, 12, { instance: node } );
			}

			for(var j in node._components)
			{
				var component = node._components[j];
				if(component.renderPicking)
					component.renderPicking(ray);
			}
		}

		//render all the picking points 
		if(this._picking_points.length)
		{
			var points = new Float32Array( this._picking_points.length * 3 );
			var colors = new Float32Array( this._picking_points.length * 4 );
			var sizes = new Float32Array( this._picking_points.length );
			for(var i = 0; i < this._picking_points.length; i++)
			{
				points.set( this._picking_points[i][0], i*3 );
				colors.set( this._picking_points[i][1], i*4 );
				sizes[i] = this._picking_points[i][2];
			}
			LS.Draw.setPointSize(1);
			LS.Draw.setColor([1,1,1,1]);
			gl.disable( gl.DEPTH_TEST ); //because nodes are show over meshes
			LS.Draw.renderPointsWithSize( points, colors, sizes );
			gl.enable( gl.DEPTH_TEST );
			this._picking_points.length = 0;
		}
	}
};


CORE.registerModule( EditorView );


// GIZMOS *****************************

LS.SceneNode.prototype.renderEditor = function( node_selected )
{
	if(!this.transform)
		return;

	LS.Draw.setColor([0.3,0.3,0.3,0.5]);
	gl.enable(gl.BLEND);

	//if this node has render instances...
	if(this._instances)
	{
		if(node_selected)
		{
			for(var i = 0; i < this._instances.length; ++i)
			{
				var instance = this._instances[i];
				if(instance.flags & LS.RI_IGNORE_FRUSTUM)
					continue;

				var oobb = instance.oobb;
				LS.Draw.setColor([0.8,0.5,0.3,0.5]);
				LS.Draw.push();
				LS.Draw.multMatrix( instance.matrix );
				LS.Draw.translate( BBox.getCenter(oobb) );

				//oobb
				var halfsize = BBox.getHalfsize(oobb);
				LS.Draw.scale( halfsize );
				LS.Draw.renderMesh( EditorView.debug_render.box_mesh, gl.LINES );
				//Draw.renderMesh( EditorView.debug_render.circle_mesh, gl.TRIANGLES );
				LS.Draw.pop();

				if(EditorView.settings.render_aabb) //render AABB
				{
					var aabb = instance.aabb;
					LS.Draw.push();
					var center = BBox.getCenter(aabb);
					var halfsize = BBox.getHalfsize(aabb);
					LS.Draw.translate(center);
					LS.Draw.setColor([0.5,0.8,0.3,0.5]);
					LS.Draw.renderWireBox(halfsize[0]*2,halfsize[1]*2,halfsize[2]*2);
					LS.Draw.pop();
				}
			}
		}
	}
	else if(0)//no render instances? then render some axis
	{
		LS.Draw.push();
		var global_matrix = this.transform.getGlobalMatrix();
		if(this.transform)
			LS.Draw.multMatrix( global_matrix );
		var s = 5;
		LS.Draw.renderLines([[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]]);
		LS.Draw.pop();
	}

	if(node_selected && EditorView.settings.render_height)
	{
		//ground line
		var center = this.transform.getGlobalPosition();
		LS.Draw.setColor([0.5,0.8,0.3,0.25]);
		LS.Draw.renderLines([center,[center[0],0,center[2]]]);
	}

	gl.disable(gl.BLEND);
}


LS.Light.icon = "mini-icon-light.png";
LS.Light.gizmo_size = 50;

LS.Light.prototype.renderEditor = function(node_selected, component_selected )
{
	var pos = this.getPosition();
	var target = this.getTarget();

	LS.Draw.setColor([1,1,1, component_selected ? 0.8 : 0.5 ]);
	gl.depthMask( false );

	if(EditorView.settings.render_icons)
	{
		gl.enable(gl.BLEND);
		LS.Draw.setColor(this.enabled ? [1,1,1] :[0.2,0.2,0.2]);
		LS.Draw.renderImage(pos, EditorModule.icons_path + "gizmo-light.png", LS.Light.gizmo_size, true);
		gl.disable(gl.BLEND);
		if(component_selected && this.type != LS.Light.OMNI)
		{
			LS.Draw.setPointSize( 8 );
			gl.disable(gl.DEPTH_TEST);
			LS.Draw.renderPoints( target ) ;
			gl.enable(gl.DEPTH_TEST);
		}
		LS.Draw.setColor( [1,1,1] );
	}

	if(!node_selected || !this.enabled) 
	{
		gl.depthMask( true );
		return;
	}

	if(this.type == LS.Light.OMNI)
	{
		if(this.range_attenuation)
		{
			LS.Draw.setColor(this.color);
			LS.Draw.setAlpha(this.intensity);
			gl.enable(gl.BLEND);
			LS.Draw.push();
			LS.Draw.translate( pos );
			LS.Draw.renderWireSphere(this.att_end);
			LS.Draw.pop();
			
			if(this.intensity > 0.1) //dark side
			{
				gl.depthFunc(gl.GREATER);
				LS.Draw.setAlpha(0.1);
				LS.Draw.push();
				LS.Draw.translate( pos );
				LS.Draw.renderWireSphere(this.att_end);
				LS.Draw.pop();
				gl.depthFunc(gl.LESS);
			}

			gl.disable(gl.BLEND);
		}
	}
	else if (this.type == LS.Light.SPOT)
	{
		var temp = vec3.create();
		var delta = vec3.create();
		vec3.subtract(delta, target,pos );
		vec3.normalize(delta, delta);
		LS.Draw.setColor(this.color);
		LS.Draw.setAlpha(this.intensity);
		gl.enable(gl.BLEND);
		var f = Math.tan( this.angle_end * DEG2RAD * 0.5 );
		var near_dist = this.att_start;
		var far_dist = this.att_end;

		vec3.scale(temp, delta, far_dist);
		vec3.add(temp, pos, temp);

		LS.Draw.push();
			LS.Draw.lookAt(pos,temp,Math.abs(delta[1]) > 0.99 ? [1,0,0] : [0,1,0]); //work in light space, thats easier to draw
			
			LS.Draw.push();
			LS.Draw.renderLines([[0,0,0],[0,0,-far_dist],
				[0,f*near_dist,-near_dist],[0,f*far_dist,-far_dist],
				[0,-f*near_dist,-near_dist],[0,-f*far_dist,-far_dist],
				[f*near_dist,0,-near_dist],[f*far_dist,0,-far_dist],
				[-f*near_dist,0,-near_dist],[-f*far_dist,0,-far_dist]
				]);
			LS.Draw.translate(0,0,-near_dist);
			if(this.spot_cone)
			{
				LS.Draw.renderCircle( near_dist * f,100 );
				LS.Draw.translate(0,0,near_dist-far_dist);
				LS.Draw.renderCircle( far_dist * f,100 );
			}
			else
			{
				LS.Draw.renderRectangle( near_dist * f*2,near_dist * f*2);
				LS.Draw.translate(0,0,near_dist-far_dist);
				LS.Draw.renderRectangle( far_dist * f*2,far_dist * f*2);
			}
			LS.Draw.pop();

			if(this.intensity > 0.1) //dark side
			{
				gl.depthFunc(gl.GREATER);
				LS.Draw.setAlpha(0.1);
				LS.Draw.renderLines([[0,0,-near_dist],[0,0,-far_dist],
					[0,f*near_dist,-near_dist],[0,f*far_dist,-far_dist],
					[0,-f*near_dist,-near_dist],[0,-f*far_dist,-far_dist],
					[f*near_dist,0,-near_dist],[f*far_dist,0,-far_dist],
					[-f*near_dist,0,-near_dist],[-f*far_dist,0,-far_dist]
					]);
				LS.Draw.translate(0,0,-near_dist);
				if(this.spot_cone)
				{
					LS.Draw.renderCircle( near_dist * f,100 );
					LS.Draw.translate(0,0,near_dist-far_dist);
					LS.Draw.renderCircle( far_dist * f,100 );
				}
				else
				{
					LS.Draw.renderRectangle( near_dist * f*2,near_dist * f*2);
					LS.Draw.translate(0,0,near_dist-far_dist);
					LS.Draw.renderRectangle( far_dist * f*2,far_dist * f*2);
				}
				gl.depthFunc(gl.LESS);
			}
		LS.Draw.pop();
		LS.Draw.setAlpha(1);
		gl.disable(gl.BLEND);
	}
	else if (this.type == LS.Light.DIRECTIONAL)
	{
		var temp = vec3.create();
		var delta = vec3.create();
		vec3.subtract(delta, target,pos);
		vec3.normalize(delta, delta);
		LS.Draw.setColor(this.color);
		LS.Draw.setAlpha(this.intensity);
		gl.enable( gl.BLEND );

		LS.Draw.push();
		LS.Draw.lookAt(pos,target,Math.abs(delta[1]) > 0.99 ? [1,0,0] : [0,1,0]); //work in light space, thats easier to draw
		LS.Draw.renderRectangle( this.frustum_size*0.5, this.frustum_size*0.5);
		LS.Draw.renderLines([[0,0,0],[0,0,-this.att_end]]);
		LS.Draw.pop();

		gl.disable( gl.BLEND );
	}

	if(!this._root.transform && EditorView.settings.render_height)
	{
		//ground line
		gl.enable(gl.BLEND);
		LS.Draw.setColor([0.5,0.8,0.3,0.25]);
		LS.Draw.renderLines([pos,[pos[0],0,pos[2]]]);
		gl.disable(gl.BLEND);
	}

	gl.depthMask( true );
}

LS.Light.prototype.renderPicking = function(ray)
{
	var pos = this.getPosition();
	EditorView.addPickingPoint( pos, LS.Light.gizmo_size, { instance: this, info: "position" } );
	/*
	var color = Renderer.getNextPickingColor( this._root, [this, "position"] );
	EditorView._picking_points.push([pos,color]);
	*/

	//target only pick if necessary
	if( this._root && this._root.transform || this.type == LS.Light.OMNI)
		return; 

	var target = this.getTarget();
	EditorView.addPickingPoint( target, 0, { instance: this, info: "target" } );

	/*
	var color = Renderer.getNextPickingColor( this._root, [this, "target"] );
	EditorView._picking_points.push([target,color]);
	*/
}

LS.Camera.gizmo_size = 50;

LS.Camera.prototype.renderPicking = function(ray)
{
	var pos = this.getEye();
	EditorView.addPickingPoint( pos, LS.Camera.gizmo_size, { instance: this, info: "eye" } );

	/*
	var color = Renderer.getNextPickingColor( this._root, [this, "eye"] );
	EditorView._picking_points.push([pos,color]);
	*/

	//target only pick if necessary
	if( this._root && this._root.transform )
		return; 

	var center = this.getCenter();
	EditorView.addPickingPoint( center, 0, { instance: this, info: "center" } );

	//middle center
	vec3.lerp( center, pos, center, 0.5 );
	EditorView.addPickingPoint( center, 0, { instance: this, info: "center" } );

	/*
	var color = Renderer.getNextPickingColor( this._root, [this, "center"] );
	EditorView._picking_points.push([center,color]);
	*/
}

LS.Camera.prototype.renderEditor = function( node_selected, component_selected )
{
	//do not render active camera frustum
	if(LS.Renderer._current_camera == this)
		return;

	//get world space coordinates
	var pos = this.getEye();
	var target = this.getCenter();

	LS.Draw.setColor([0.33,0.874,0.56, component_selected ? 0.8 : 0.5 ]);
	gl.depthMask( false );

	//render camera icon
	if(EditorView.settings.render_icons)
	{
		gl.enable(gl.BLEND);
		LS.Draw.renderImage( pos, EditorModule.icons_path + "gizmo-camera.png",50, true);
		gl.disable(gl.BLEND);
		if(component_selected && !this._root.transform ) //only render in root cameras
		{
			LS.Draw.setPointSize( 10 );
			gl.disable(gl.DEPTH_TEST);
			LS.Draw.renderRoundPoints( [ target, vec3.lerp( vec3.create(), pos, target, 0.5 ) ] ) ;
			gl.enable(gl.DEPTH_TEST);
		}
	}

	//if node is selected, render frustrum
	if (node_selected && this.enabled)
	{
		var f = Math.tan( this.fov * DEG2RAD * 0.5 );
		var near = this.near;
		var far = this.far;
		var mid_frustum = this.frustum_size * 0.5;
		var aspect = this._aspect;

		var temp = vec3.create();
		var delta = vec3.create();
		vec3.subtract(delta, target, pos);


		var focus_dist = 0;
		focus_dist = this.focalLength;
		/*
		if(this._root && this._root.transform)
			focus_dist = (far - near) * 0.5 + near;
		else
			focus_dist = vec3.length(delta);
		*/
		vec3.normalize(delta, delta);
		gl.enable(gl.BLEND);

		var up = this.up; //Math.abs(delta[1]) > 0.99 ? [1,0,0] : [0,1,0];

		LS.Draw.push();
		LS.Draw.lookAt(pos,target,up); //work in light space, thats easier to draw

		if( this.type == LS.Camera.ORTHOGRAPHIC)
		{
			LS.Draw.renderLines([[0,0,-near],[0,0,-focus_dist],
				[-mid_frustum * aspect,mid_frustum,-near],[-mid_frustum * aspect,mid_frustum,-focus_dist],
				[mid_frustum * aspect,mid_frustum,-near],[mid_frustum * aspect,mid_frustum,-focus_dist],
				[-mid_frustum * aspect,-mid_frustum,-near],[-mid_frustum * aspect,-mid_frustum,-focus_dist],
				[mid_frustum * aspect,-mid_frustum,-near],[mid_frustum * aspect,-mid_frustum,-focus_dist],
			]);
		}
		else
		{
			LS.Draw.renderLines([[0,0,0],[0,0,-focus_dist],
				[-f * near * aspect,f * near,-near],[-f * focus_dist * aspect,f * focus_dist,-focus_dist],
				[f * near * aspect,f * near,-near],[f * focus_dist * aspect,f * focus_dist,-focus_dist],
				[-f * near * aspect,-f * near,-near],[-f * focus_dist * aspect,-f * focus_dist,-focus_dist],
				[f * near * aspect,-f * near,-near],[f * focus_dist * aspect,-f * focus_dist,-focus_dist],
			]);
		}

		LS.Draw.translate(0,0,-this.near);

		if( this.type == LS.Camera.ORTHOGRAPHIC)
			LS.Draw.renderRectangle( mid_frustum * 2 * aspect, mid_frustum * 2);
		else
			LS.Draw.renderRectangle( f * near * 2 * aspect, f * near * 2);

		LS.Draw.translate(0,0,near-focus_dist);

		if( this.type == LS.Camera.ORTHOGRAPHIC)
			LS.Draw.renderRectangle( mid_frustum * 2 * aspect, mid_frustum * 2);
		else
			LS.Draw.renderRectangle( f * focus_dist * 2 * aspect, f * focus_dist * 2);

		LS.Draw.pop();

		gl.disable(gl.BLEND);
	}

	if( node_selected && !this._root.transform && EditorView.settings.render_height)
	{
		//ground line
		gl.enable(gl.BLEND);
		LS.Draw.setColor([0.5,0.8,0.3,0.25]);
		LS.Draw.renderLines([pos,[pos[0],0,pos[2]]]);
		gl.disable(gl.BLEND);
	}

	gl.depthMask( true );
}

//PRELOAD STUFF
EditorView.grid_img = new Image();
EditorView.grid_img.src = "imgs/grid.png";
EditorView.grid_img.onload = function(){ this.loaded = true; }

