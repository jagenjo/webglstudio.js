// Used to render all the gizmos in the 3D environment
// It behaves as a module.

var EditorView = {

	name: "view",

	preferences: {
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
		render_boundings: false,
		render_tree: false,
		render_skeletons: true,
		render_names: false,
		render_height: true,
		render_selection_wireframe: false,
		render_probes_link: false
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

		LS.Renderer.on_render_gui = this.onRenderGUI.bind(this);

		LEvent.bind( LS.GlobalScene, LS.EVENT.RENDER_HELPERS, this.renderView.bind(this));
		LEvent.bind( LS.GlobalScene, LS.EVENT.RENDER_PICKING, this.renderPicking.bind(this));
	},

	onShowPreferencesPanel: function(name,widgets)
	{
		if(name != "editor")
			return;

		widgets.addTitle("View");
		widgets.inspectInstance( this.preferences );

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

	onRenderGUI: function(render_settings)
	{
		if(!render_settings.in_player)
			LEvent.trigger( LS.GlobalScene, "renderEditorGUI", gl );
	},

	//called from the CanvasManager event handlers when any event is fired in the canvas
	sendToLayoutGizmos: function( name, event )
	{
		var blocked = false;

		//to every viewport
		for(var i = 0; i < RenderModule.viewports.length; i++)
		{
			var viewport = RenderModule.viewports[i];

			if( viewport.gizmos && viewport.gizmos.length )
			{
				for(var j = 0; j < viewport.gizmos.length; j++)
				{
					var gizmo = viewport.gizmos[j];
					var r = null;
					if(gizmo[name]) //has method with that name (mousedown, etc)
						r = gizmo[name].apply( gizmo, [ event ] );
					if(r === true)
						return true; //break
				}
			}
		}

		return blocked;
	},

	update: (function(){ 
		var event = { type: "update", seconds: 0 };
		return function(seconds)
		{
			event.seconds = seconds;
			this.sendToLayoutGizmos("update", event);
		}
	})(),

	mousedown: function(e)
	{
		//check if the mouse is between layouts
		//TODO
		var r = this.sendToLayoutGizmos("mousedown", e );
		return r;
	},

	mousemove: function(e)
	{
		var r = this.sendToLayoutGizmos("mousemove", e );
		return r;
	},

	mouseup: function(e)
	{
		var r = this.sendToLayoutGizmos("mouseup", e );
		if(r)
			return r;

		if(e.button == LS.Input.RIGHT_MOUSE_BUTTON && e.click_time < 200)
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
		return this.sendToLayoutGizmos("mousewheel", e );
	},

	renderEditor: function( camera )
	{
		//copy preferences... ?
		for(var i in this.preferences)
			this.debug_render.settings[i] = this.preferences[i];

		//call debug render to render grid, etc
		this.debug_render.render( camera, SelectionModule.isSelected.bind( SelectionModule ) );

		gl.depthFunc( gl.LEQUAL );

		//used to render script tools gizmos
		LEvent.trigger( LS.GlobalScene, "renderEditor" );

		//outline
		var selected_node = SelectionModule.getSelectedNode();
		if( selected_node && selected_node._instances.length )
			this.renderInstancesOutline( selected_node._instances, [1,0.75,0.5,0.75] );

		gl.depthFunc( gl.LESS );
		gl.viewport(0,0,gl.canvas.width,gl.canvas.height); //??
	},

	//used for picking just points **************************************************
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
				if( this.preferences.render_null_nodes )
					LS.Picking.addPickingPoint( pos, 12, { instance: node } );
			}

			for(var j in node._components)
			{
				var component = node._components[j];
				if(component.renderPicking)
					component.renderPicking(ray);
			}
		}

		LS.Picking.renderPickingPoints();
	},

	renderInstancesOutline: function( instances, color )
	{
		var current_view = RenderModule.getActiveViewport();
		var viewport = current_view.viewport_pixels;
		if(!current_view._outline_buffer || current_view._outline_buffer.width != viewport[2] || current_view._outline_buffer.height != viewport[3] )
			current_view._outline_buffer = new GL.Texture( viewport[2], viewport[3] );
		var texture = current_view._outline_buffer;

		var camera = LS.Renderer._current_camera;

		texture.drawTo(function(){
			gl.clearColor(0,0,0,0);
			gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

			var mat = camera._overwrite_material || null;
			if(!this._outline_material)
			{
				this._outline_material = LS.ShaderMaterial.createFlatMaterial();
				this._outline_material.color = [1,1,1,1];
				this._outline_material._render_state.depth_test = false;
				this._outline_material._render_state.cull_face = false;
			}

			this._outline_material.prepare(LS.Renderer._current_scene);
			camera._overwrite_material = this._outline_material;
			LS.RenderQueue.readback_allowed = false;
			LS.Renderer.renderInstances( LS.Renderer._current_render_settings, instances );
			LS.RenderQueue.readback_allowed = true;
			camera._overwrite_material = mat;
		});

		var outline_shader = this._outline_shader;
		if(!this._outline_shader)
			outline_shader = this._outline_shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, this.outline_shader_code );
		outline_shader.setUniform("u_viewport", gl.viewport_data );
		outline_shader.setUniform("u_color", color || LS.ONES4 );
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		texture.toViewport( outline_shader );
		gl.disable( gl.BLEND );
		gl.enable( gl.DEPTH_TEST );
	},

	outline_shader_code: "\n\
		precision mediump float;\n\
		varying vec2 v_coord;\n\
		uniform sampler2D u_texture;\n\
		uniform vec4 u_viewport;\n\
		uniform vec4 u_color;\n\
		void main() {\n\
			vec2 ix = vec2( 1.0 / u_viewport.z, 0.0 );\n\
			vec2 iy = vec2( 0.0, 1.0 / u_viewport.w );\n\
			float C = texture2D(u_texture,v_coord).x;\n\
			float L = texture2D(u_texture,v_coord - ix).x;\n\
			float T = texture2D(u_texture,v_coord - iy).x;\n\
			float LT = texture2D(u_texture,v_coord - iy - ix).x;\n\
			float edge = clamp(abs(C-L) + abs(C-T) + abs(C-LT),0.0,1.0);\n\
			gl_FragColor = vec4(u_color.xyz,u_color.a * edge);\n\
		}\n\
	"
};


CORE.registerModule( EditorView );


// GIZMOS *****************************
var selected_shader_code = "\n\
\\color.fs\n\
	precision mediump float;\n\
	uniform vec4 u_material_color;\n\
	void main() {\n\
		float dis = -1.0;\n\
		if( mod(gl_FragCoord.x,4.0) <= 1.0 && mod(gl_FragCoord.y,4.0) <= 1.0 )\n\
			dis *= -1.0;\n\
		if(dis < 0.0)\n\
			discard;\n\
		gl_FragColor = u_material_color;\n\
	}\n\
"

LS.SceneNode.prototype.renderEditor = function( node_selected )
{
	if(!this.transform)
		return;

	LS.Draw.setColor([0.3,0.3,0.3,0.5]);
	gl.enable(gl.BLEND);
	var camera = LS.Renderer._current_camera;

	var probe_links = EditorView.preferences.render_probes_link ? [] : null;

	//if this node has render instances...
	if(this._instances)
	{
		//this code makes the instances blink when selected
		if( 0 && SelectionModule.blink > 0 && node_selected && this._instances.length) //render selected as brighter
		{
			--SelectionModule.blink;
			LS.GlobalScene.requestFrame();

			if( SelectionModule.blink % 2 == 1 )
			{
				var mat = camera._overwrite_material || null;
				if(!this._selection_material)
				{
					this._selection_material = new LS.ShaderMaterial();
					this._selection_material.shader_code = new LS.ShaderCode(selected_shader_code);
					this._selection_material.color = [1,0.5,0.0,1];
					this._selection_material._render_state.depth_func = GL.EQUAL;
				}

				this._selection_material.prepare(LS.Renderer._current_scene);
				camera._overwrite_material = this._selection_material;
				LS.Renderer.renderInstances( LS.Renderer._current_render_settings, this._instances );
				camera._overwrite_material = mat;
			}
		}

		//this render debug info like boundings
		for(var i = 0; i < this._instances.length; ++i)
		{
			var instance = this._instances[i];
			var aabb = instance.aabb;

			if( EditorView.preferences.render_probes_link && instance._nearest_reflection_probe )
			{
				if( node_selected )
				{
					LS.Draw.setColor([1,1,1,1]);
					LS.Draw.renderLines([instance.center, instance._nearest_reflection_probe._position]);
				}
				else
					probe_links.push( instance.center, instance._nearest_reflection_probe._position );
			}

			if(node_selected && EditorView.preferences.render_selection_wireframe )
			{
				LS.Draw.setColor([1,1,0.5,0.01]);
				gl.disable( gl.DEPTH_TEST );
				LS.Draw.push();
				LS.Draw.multMatrix( instance.matrix );
				LS.Draw.renderMesh( instance.mesh, gl.TRIANGLES, null, "triangles", instance.range[0], instance.range[1] );
				LS.Draw.pop();
				gl.enable( gl.DEPTH_TEST );
			}

			//render bounding
			if( (node_selected || EditorView.preferences.render_boundings) && !(instance.flags & LS.RI_IGNORE_FRUSTUM) )
			{
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

				if(EditorView.preferences.render_aabb) //render AABB
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

	if( probe_links && probe_links.length )
	{
		LS.Draw.setColor([0.5,0.8,0.9,0.5]);
		LS.Draw.renderLines(probe_links);
	}

	if(node_selected && EditorView.preferences.render_height)
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

	if(EditorView.preferences.render_icons)
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
		LS.Draw.renderRectangle( this.frustum_size, this.frustum_size);
		LS.Draw.renderLines([[0,0,0],[0,0,-this.att_end]]);
		LS.Draw.pop();

		gl.disable( gl.BLEND );
	}

	if(!this._root.transform && EditorView.preferences.render_height)
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
	LS.Picking.addPickingPoint( pos, LS.Light.gizmo_size, { instance: this, info: "position" } );

	//target only pick if necessary
	if( this._root && this._root.transform || this.type == LS.Light.OMNI)
		return; 

	var target = this.getTarget();
	LS.Picking.addPickingPoint( target, 0, { instance: this, info: "target" } );
}

LS.Camera.gizmo_size = 50;

LS.Camera.prototype.renderPicking = function(ray)
{
	var pos = this.getEye();
	LS.Picking.addPickingPoint( pos, LS.Camera.gizmo_size, { instance: this, info: "eye" } );

	//target only pick if necessary
	if( this._root && this._root.transform )
		return; 

	var center = this.getCenter();
	LS.Picking.addPickingPoint( center, 0, { instance: this, info: "center" } );

	//middle center
	var middle = vec3.lerp( vec3.create(), pos, center, 0.5 );
	LS.Picking.addPickingPoint( middle, 0, { instance: this, info: "center" } );
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
	if(EditorView.preferences.render_icons)
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
		vec3.normalize(delta, delta);
		gl.enable(gl.BLEND);

		var up = this.getUp();

		LS.Draw.push();
		LS.Draw.lookAt(pos,target,up); //work in light space, thats easier to draw

		if( this.type == LS.Camera.ORTHOGRAPHIC)
		{
			var size = this.frustum_size * 0.5;
			LS.Draw.renderLines([[0,0,-near],[0,0,-focus_dist],
				[-size * aspect,size,-near],[-size * aspect,size,-focus_dist],
				[size * aspect,size,-near],[size * aspect,size,-focus_dist],
				[-size * aspect,-size,-near],[-size * aspect,-size,-focus_dist],
				[size * aspect,-size,-near],[size * aspect,-size,-focus_dist],
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

	if( node_selected && !this._root.transform && EditorView.preferences.render_height)
	{
		//ground line
		gl.enable(gl.BLEND);
		LS.Draw.setColor([0.5,0.8,0.3,0.25]);
		LS.Draw.renderLines([pos,[pos[0],0,pos[2]]]);
		gl.disable(gl.BLEND);
	}

	gl.depthMask( true );
}

LS.Components.ReflectionProbe.prototype.renderEditor = function()
{
	if(!this._texture || !LS.Components.ReflectionProbe.visualize_helpers || !LS.Components.ReflectionProbe.helper_size )
		return;

	this.renderProbe( LS.Components.ReflectionProbe.visualize_irradiance );
}


LS.Components.ReflectionProbe.prototype.renderPicking = function()
{
	if(!this._texture || !LS.Components.ReflectionProbe.visualize_helpers || !LS.Components.ReflectionProbe.helper_size )
		return;

	this.renderProbe(false, LS.Picking.getNextPickingColor( this._root, [this] ) );
}

if(LS.Components.PlaySkeletalAnimation)
	LS.Components.PlaySkeletalAnimation.prototype.renderEditor = function( node_selected, component_selected )
	{
		if(node_selected && this._root.transform )
		{
			if(this._skeleton.bones.length == 0)
				this.applyAnimation(this.current_time);
			this._skeleton.updateGlobalMatrices();
			gl.disable( gl.DEPTH_TEST );
			LS.Draw.push();
			LS.Draw.setMatrix( this._root.transform.getGlobalMatrixRef() );
			var vertices = this._skeleton.getVertices();
			if(vertices)
			{
				LS.Draw.setColor([1,0,1,0.5]);
				LS.Draw.renderLines(vertices);
			}
			LS.Draw.pop();
			gl.enable( gl.DEPTH_TEST );
		}
	}


//PRELOAD STUFF
EditorView.grid_img = new Image();
EditorView.grid_img.src = "imgs/grid.png";
EditorView.grid_img.onload = function(){ this.loaded = true; }

