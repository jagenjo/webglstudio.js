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
		render_names: false
	},

	render_debug_info: true,
	render_gizmos: true,
	render_helpers: true, //icons, grid, cones, etc
	render_graph: false,
	textures_display: [],

	debug_points: [], //used for debugging, allows to draw points easily

	colors: {
		selected: vec4.fromValues(1,1,1,1),
		node: vec4.fromValues(1,0.5,0,1),
		bone: vec4.fromValues(1,0,0.5,1)
	},

	init: function()
	{
		if(!gl) return;

		//LEvent.jQuery = true;

		//LEvent.bind(Scene, "afterRenderScene", function() { EditorModule.renderEditor(); });

		this.createMeshes();
		RenderModule.viewport3d.addModule(this);

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

	//called from GraphicsViewport, used to render screen space gizmos
	render: function()
	{
		if(!this.mustRenderHelpers())
			return;


		//render viewports edge lines
		var cameras = RenderModule.cameras;
		var viewport = vec4.create();

		//render lines
		if(cameras.length > 1)
		{
			gl.start2D();
			gl.globalAlpha = 0.5;
			for(var i = 0; i < cameras.length; i++)
			{
				var camera = cameras[i];
				camera.getLocalViewport( null, viewport );
				gl.strokeColor = (camera == ToolsModule.selected_camera ? [1,1,1] : [0.5,0.5,0.5]);
				gl.strokeRect( viewport[0],gl.canvas.height - viewport[3] - viewport[1],viewport[2],viewport[3] );
			}
			gl.finish2D();
		}

		//render gizmos
		this.sendToGizmos("render");
	},

	//called from LS.Renderer after the event afterRenderScene is triggered
	//renders the gizmos that belong to world space
	renderView: function(e, camera)
	{
		if(LS.Renderer._current_scene != LS.GlobalScene)
			return;

		if(this.mustRenderHelpers())
			this.renderEditor( camera );

		//if(!this.enabled) return;
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
		if(this.render_helpers && !RenderModule.render_settings.in_player && RenderModule.frame_updated)
			return true;
		return false;
	},

	sendToGizmos: function(name, params)
	{
		for(var i = 0; i < RenderModule.cameras.length; i++)
		{
			var camera = RenderModule.cameras[i];
			if(!camera._gizmos || !camera._gizmos.length )
				continue;

			for(var j = 0; j < camera._gizmos.length; j++)
			{
				var gizmo = camera._gizmos[j];
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
		this.sendToGizmos("update",[seconds]);
	},

	mousedown: function(e)
	{
		return this.sendToGizmos("mousedown",[e]);
	},

	mousemove: function(e)
	{
		return this.sendToGizmos("mousemove",[e]);
	},

	mouseup: function(e)
	{
		return this.sendToGizmos("mouseup",[e]);
	},

	mousewheel: function(e)
	{
		return this.sendToGizmos("mousewheel",[e]);
	},

	_points: [], //linear array with x,y,z, x,y,z, ...
	_points_color: [],
	_points_nodepth: [], //linear array with x,y,z, x,y,z, ...
	_points_color_nodepth: [],
	_lines: [], //vec3,vec3 array
	_lines_color: [], //
	_names: [], //array of [vec3, string]

	//this primitives are rendered after all the components editors are rendered
	renderPoint: function( p, ignore_depth, c )
	{
		c = c || [1,1,1,1];
		if(ignore_depth)
		{
			this._points_nodepth.push( p[0], p[1], p[2] );
			this._points_color_nodepth.push( c[0], c[1], c[2], c[3] );
		}
		else
		{
			this._points.push( p[0], p[1], p[2] );
			this._points_color.push( c[0], c[1], c[2], c[3] );
		}
	},

	renderLine: function( start, end, color )
	{
		color = color || [1,1,1,1];
		this._lines.push( start, end );
		this._lines_color.push( color, color );
	},

	renderText: function( position, text, color )
	{
		color = color || [1,1,1,1];
		this._names.push([text,position, color]);
	},

	renderEditor: function( camera )
	{
		var shader = RenderModule.viewport3d.flat_shader;
		var viewport3d = RenderModule.viewport3d;
		//gl.viewport( Renderer._full_viewport[0], Renderer._full_viewport[1], Renderer._full_viewport[2], Renderer._full_viewport[3] );

		gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
		gl.enable( gl.DEPTH_TEST );
		gl.disable(gl.BLEND);
		gl.disable( gl.CULL_FACE );
		gl.depthFunc( gl.LEQUAL );
		//gl.depthMask( false );

		//var camera = RenderModule.camera;
		//Draw.setCamera(camera); //should be already set
		//Draw.setCameraPosition(camera.getEye());
		//Draw.setViewProjectionMatrix(Renderer._view_matrix, Renderer._projection_matrix, Renderer._viewprojection_matrix);

		if( EditorView.settings.render_grid && this.settings.grid_alpha > 0 )
			this.renderGrid();

		LS.Draw.setColor([0.2,0.2,0.2,1.0]);
		LS.Draw.push();
		LS.Draw.scale(0.01,0.01,0.01);
		LS.Draw.renderText("Origin");
		LS.Draw.pop();

		if(EditorView.settings.render_component)
		{
			var selected_node = SelectionModule.getSelectedNode();

			//Node components
			for(var i = 0, l = LS.GlobalScene._nodes.length; i < l; ++i)
			{
				var node = LS.GlobalScene._nodes[i];
				var is_selected = node._is_selected; //SelectionModule.isSelected( node );
				if(node.renderEditor)
					node.renderEditor( is_selected );
				for(var j = 0, l2 = node._components.length; j < l2; ++j)
				{
					var component = node._components[j];
					var is_component_selected = SelectionModule.isSelected( component );
					if(component.renderEditor)
						component.renderEditor( node == selected_node, is_component_selected );
				}
			}
		}

		//render local things		
		var zero = vec3.create();
		for(var i = 0, l = LS.GlobalScene._nodes.length; i < l; ++i)
		{
			var node = LS.GlobalScene._nodes[i];
			if(!node.transform) 
				continue;

			var global = node.transform.getGlobalMatrixRef();
			var pos = mat4.multiplyVec3( vec3.create(), global, zero ); //create a new one to store them

			if( this.settings.render_null_nodes )
			{
				if( node._is_selected )
					this.renderPoint( pos, true, this.colors.selected );
				else if( node._is_bone )
					this.renderPoint( pos, true, this.colors.bone );
				else
					this.renderPoint( pos, false, this.colors.node );
			}

			if(EditorView.settings.render_names)
				this.renderText(pos, node.name, node._is_selected ? [0.94, 0.8, 0.4,1] : [0.8,0.8,0.8,0.9] );

			if (node._parentNode && node._parentNode.transform && (EditorView.settings.render_tree || (EditorView.settings.render_skeletons && node._is_bone && node._parentNode._is_bone)) )
			{
				this.renderLine( pos , node._parentNode.transform.getGlobalPosition(), this.colors.bone );
				//this.renderPoint( pos, true, this.colors.bone );
			}

			if(this.settings.render_axis)
			{
				LS.Draw.push();
				LS.Draw.multMatrix(global);
				LS.Draw.setColor([1,1,1,1]);
				LS.Draw.renderMesh( EditorView.axis_mesh, gl.LINES );
				LS.Draw.pop();
			}
		}

		this.renderColliders();
		this.renderPaths();

		//Render primitives (points, lines, text) ***********************

		if(this._points.length)
		{
			LS.Draw.setPointSize(4);
			LS.Draw.setColor([1,1,1,1]);
			LS.Draw.renderPoints( this._points, this._points_color );
			this._points.length = 0;
			this._points_color.length = 0;
		}

		if(this._points_nodepth.length)
		{
			LS.Draw.setPointSize(4);
			LS.Draw.setColor([1,1,1,1]);
			gl.disable( gl.DEPTH_TEST );
			LS.Draw.renderPoints( this._points_nodepth, this._points_color_nodepth );
			gl.enable( gl.DEPTH_TEST );
			this._points_nodepth.length = 0;
			this._points_color_nodepth.length = 0;
		}


		if(this._lines.length)
		{
			gl.disable( gl.DEPTH_TEST );
			LS.Draw.setColor([1,1,1,1]);
			LS.Draw.renderLines( this._lines, this._lines_color );
			gl.enable( gl.DEPTH_TEST );
			this._lines.length = 0;
			this._lines_color.length = 0;
		}

		if(this.debug_points.length)
		{
			LS.Draw.setPointSize(5);
			LS.Draw.setColor([1,0,1,1]);
			LS.Draw.renderPoints( this.debug_points );
		}

		if(EditorView.settings.render_names)
		{
			gl.disable( gl.DEPTH_TEST );
			var camera2D = new LS.Camera({eye:[0,0,0],center:[0,0,-1]});
			var viewport = gl.getViewport();
			camera2D.setOrthographic(0,viewport[2], 0,viewport[3], -1,1);
			camera2D.updateMatrices();
			/*
			Draw.pushCamera();
			Draw.setCamera( camera2D );
			Draw.setColor([0.8,0.9,1,1]);
			*/

			gl.start2D();
			//gl.disable( gl.BLEND );
			gl.font = "14px Arial";
			var black_color = vec4.fromValues(0,0,0,0.5);

			for(var i = 0; i < this._names.length; ++i)
			{
				var pos2D = camera.project( this._names[i][1] );
				if(pos2D[2] < 0)
					continue;
				pos2D[2] = 0;

				var text_size = gl.measureText( this._names[i][0] );
				gl.fillColor = black_color;
				gl.fillRect( Math.floor(pos2D[0] + 10), viewport[3] - (Math.floor(pos2D[1] + 8)), text_size.width, text_size.height );
				gl.fillColor = this._names[i][2];
				gl.fillText( this._names[i][0], Math.floor(pos2D[0] + 10), viewport[3] - (Math.floor(pos2D[1] - 4) ) );
			}
			gl.finish2D();


			//Draw.popCamera();
			this._names.length = 0;
		}

		//DEBUG
		var selected_node = SelectionModule.getSelectedNode();
		if(0 && selected_node && selected_node.transform) //render axis for all nodes
		{
			LS.Draw.push();
			var Q = selected_node.transform.getGlobalRotation();
			var R = mat4.fromQuat( mat4.create(), Q );
			LS.Draw.setMatrix( R );
			LS.Draw.setColor([1,1,1,1]);
			LS.Draw.scale(10,10,10);
			LS.Draw.renderMesh( this.axis_mesh, gl.LINES );
			LS.Draw.pop();
		}

		//render textures in manager, used for some debugging
		this.renderTextures();

		LEvent.trigger( LS.GlobalScene, "renderEditor" );

		gl.depthFunc( gl.LESS );

		gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
	},

	renderGrid: function()
	{
		//textured grid
		if(!this.grid_shader)
		{
			//this.grid_shader = LS.Draw.createSurfaceShader("float PI2 = 6.283185307179586; return vec4( vec3( max(0.0, cos(pos.x * PI2 * 0.1) - 0.95) * 10.0 + max(0.0, cos(pos.z * PI2 * 0.1) - 0.95) * 10.0 ),1.0);");
			this.grid_shader = LS.Draw.createSurfaceShader("vec2 f = vec2(1.0/64.0,-1.0/64.0); float brightness = texture2D(u_texture, pos.xz + f).x * 0.6 + texture2D(u_texture, pos.xz * 0.1 + f ).x * 0.3 + texture2D(u_texture, pos.xz * 0.01 + f ).x * 0.2; brightness /= max(1.0,0.001 * length(u_camera_position.xz - pos.xz));return u_color * vec4(vec3(1.0),brightness);");
			this.grid_shader_xy = LS.Draw.createSurfaceShader("vec2 f = vec2(1.0/64.0,-1.0/64.0); float brightness = texture2D(u_texture, pos.xy + f).x * 0.6 + texture2D(u_texture, pos.xy * 0.1 + f ).x * 0.3 + texture2D(u_texture, pos.xy * 0.01 + f ).x * 0.2; brightness /= max(1.0,0.001 * length(u_camera_position.xy - pos.xy));return u_color * vec4(vec3(1.0),brightness);");
			this.grid_shader_yz = LS.Draw.createSurfaceShader("vec2 f = vec2(1.0/64.0,-1.0/64.0); float brightness = texture2D(u_texture, pos.yz + f).x * 0.6 + texture2D(u_texture, pos.yz * 0.1 + f ).x * 0.3 + texture2D(u_texture, pos.yz * 0.01 + f ).x * 0.2; brightness /= max(1.0,0.001 * length(u_camera_position.yz - pos.yz));return u_color * vec4(vec3(1.0),brightness);");
			this.grid_shader.uniforms({u_texture:0});

			if( this.grid_img && this.grid_img.loaded )
				this.grid_texture = GL.Texture.fromImage( this.grid_img, {format: gl.RGB, wrap: gl.REPEAT, anisotropic: 4, minFilter: gl.LINEAR_MIPMAP_LINEAR } );
			else
				this.grid_texture = GL.Texture.fromURL( "imgs/grid.png", {format: gl.RGB, wrap: gl.REPEAT, anisotropic: 4, minFilter: gl.LINEAR_MIPMAP_LINEAR } );
		}

		LS.Draw.push();

		if(this.settings.grid_plane == "xy")
			LS.Draw.rotate(90,1,0,0);
		else if(this.settings.grid_plane == "yz")
			LS.Draw.rotate(90,0,0,1);

		if(!this.grid_texture || this.grid_texture.ready === false)
		{
			//lines grid
			LS.Draw.setColor([0.2,0.2,0.2, this.settings.grid_alpha * 0.75]);
			LS.Draw.scale( this.settings.grid_scale , this.settings.grid_scale , this.settings.grid_scale );
			LS.Draw.renderMesh( this.grid_mesh, gl.LINES );
			LS.Draw.scale(10,10,10);
			LS.Draw.renderMesh( this.grid_mesh, gl.LINES );
		}
		else
		{
			//texture grid
			gl.enable(gl.BLEND);
			this.grid_texture.bind(0);
			gl.depthMask( false );
			LS.Draw.setColor([1,1,1, this.settings.grid_alpha ]);
			LS.Draw.translate( LS.Draw.camera_position[0], 0, LS.Draw.camera_position[2] ); //follow camera
			LS.Draw.scale( 10000, 10000, 10000 );
			LS.Draw.renderMesh( this.plane_mesh, gl.TRIANGLES, this.settings.grid_plane == "xy" ? this.grid_shader_xy : this.grid_shader );
			gl.depthMask( true );
		}

		LS.Draw.pop();
	},

	renderPaths: function()
	{
		var scene = LS.GlobalScene;
		if(!scene._paths)
			return;

		LS.Draw.setColor([0.7,0.6,0.3,0.5]);

		for(var i = 0; i < scene._paths.length; ++i)
		{
			var path = scene._paths[i];
			var points = path.samplePoints(0);
			LS.Draw.renderLines( points, null, true );
		}
	},

	renderColliders: function()
	{
		var scene = LS.GlobalScene;
		if(!scene._colliders)
			return;

		LS.Draw.setColor([0.33,0.71,0.71,0.5]);

		for(var i = 0; i < scene._colliders.length; ++i)
		{
			var instance = scene._colliders[i];
			var oobb = instance.oobb;

			if(0) //render AABB
			{
				var aabb = instance.aabb;
				LS.Draw.push();
				var center = BBox.getCenter(aabb);
				var halfsize = BBox.getHalfsize(aabb);
				LS.Draw.translate(center);
				//LS.Draw.setColor([0.33,0.71,0.71,0.5]);
				LS.Draw.renderWireBox(halfsize[0]*2,halfsize[1]*2,halfsize[2]*2);
				LS.Draw.pop();
			}

			LS.Draw.push();
			LS.Draw.multMatrix( instance.matrix );
			var halfsize = BBox.getHalfsize(oobb);

			if(instance.type == LS.PhysicsInstance.BOX)
			{
				LS.Draw.translate( BBox.getCenter(oobb) );
				LS.Draw.renderWireBox( halfsize[0]*2, halfsize[1]*2, halfsize[2]*2 );
			}
			else if(instance.type == LS.PhysicsInstance.SPHERE)
			{
				//Draw.scale(,halfsize[0],halfsize[0]);
				LS.Draw.translate( BBox.getCenter(oobb) );
				LS.Draw.renderWireSphere( halfsize[0], 20 );
			}
			else if(instance.type == LS.PhysicsInstance.MESH)
			{
				var mesh = instance.mesh;
				if(mesh)
				{
					if(!mesh.indexBuffers["wireframe"])
						mesh.computeWireframe();
					LS.Draw.renderMesh(mesh, gl.LINES, null, "wireframe" );
				}
			}

			LS.Draw.pop();
		}
	},

	//used for picking just points
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

		var camera = RenderModule.camera;
		LS.Draw.setCamera( camera );
		LS.Draw.setPointSize( 20 );

		var ray = camera.getRayInPixel( mouse_pos[0], mouse_pos[1] );
		ray.end = vec3.add( vec3.create(), ray.start, vec3.scale(vec3.create(), ray.direction, 10000) );

		//Node components
		for(var i = 0, l = LS.GlobalScene._nodes.length; i < l; ++i)
		{
			var node = LS.GlobalScene._nodes[i];
			if(node.renderPicking)
				node.renderPicking(ray);

			if(node.transform)
			{
				var pos = vec3.create();
				mat4.multiplyVec3(pos, node.transform.getGlobalMatrixRef(), pos); //create a new one to store them
				if( this.settings.render_null_nodes )
					this.addPickingPoint( pos, 40, { instance: node } );
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
			gl.disable( gl.DEPTH_TEST );
			LS.Draw.renderPointsWithSize( points, colors, sizes );
			gl.enable( gl.DEPTH_TEST );
			this._picking_points.length = 0;
		}
	},

	//used to render tiny quads with textures (debug info)
	renderTextures: function()
	{
		// Draw shadowmap plane
		for(var i = 0; i < this.textures_display.length; i++)
		{
			var tex = this.textures_display[i];

			gl.viewport(0 + i * 256, 10, 10 + 256, 10 + 256);
			//gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
			tex.toViewport();
			//Shaders.get("screen").uniforms({color: [1,1,1,1]}).draw(RenderModule.viewport3d.screen_plane);
		}
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	},

	createMeshes: function()
	{
		//plane
		this.plane_mesh = GL.Mesh.plane({xz:true});

		//grid
		var dist = 10;
		var num = 10;
		var vertices = [];
		for(var i = -num; i <= num; i++)
		{
			vertices.push([i*dist,0,dist*num]);
			vertices.push([i*dist,0,-dist*num]);
			vertices.push([dist*num,0,i*dist]);
			vertices.push([-dist*num,0,i*dist]);
		}
		this.grid_mesh = GL.Mesh.load({vertices:vertices});

		//box
		vertices = new Float32Array([-1,1,1 , -1,1,-1, 1,1,-1, 1,1,1, -1,-1,1, -1,-1,-1, 1,-1,-1, 1,-1,1]);
		var triangles = new Uint16Array([0,1, 0,4, 0,3, 1,2, 1,5, 2,3, 2,6, 3,7, 4,5, 4,7, 6,7, 5,6 ]);
		this.box_mesh = GL.Mesh.load({vertices: vertices, lines:triangles });

		//circle
		this.circle_mesh = GL.Mesh.circle({size:1,slices:50});
		this.circle_empty_mesh = GL.Mesh.circle({size:1,slices:50,empty:1});
		this.sphere_mesh = GL.Mesh.icosahedron({size:1, subdivisions: 3});

		//dummy
		vertices = [];
		vertices.push([-dist*0.5,0,0],[+dist*0.5,0,0]);
		vertices.push([0,-dist*0.5,0],[0,+dist*0.5,0]);
		vertices.push([0,0,-dist*0.5],[0,0,+dist*0.5]);
		this.dummy_mesh = GL.Mesh.load({vertices:vertices});

		//box
		vertices = [];
		vertices.push([-1.0,1.0,1.0],[1.0,1.0,1.0],[-1.0,1.0,-1.0], [1.0,1.0,-1.0],[-1.0,-1.0,1.0], [1.0,-1.0,1.0],[-1.0,-1.0,-1.0], [1.0,-1.0,-1.0]);
		vertices.push([1.0,-1.0,1.0],[1.0,1.0,1.0],[1.0,-1.0,-1.0],[1.0,1.0,-1.0],[-1.0,-1.0,1.0],[-1.0,1.0,1.0],[-1.0,-1.0,-1.0],[-1.0,1.0,-1.0]);
		vertices.push([1.0,1.0,1.0],[1.0,1.0,-1.0],[1.0,-1.0,1.0],[1.0,-1.0,-1.0],[-1.0,1.0,1.0],[-1.0,1.0,-1.0],[-1.0,-1.0,1.0],[-1.0,-1.0,-1.0]);
		this.cube_mesh = GL.Mesh.load({vertices:vertices});

		for(var i = 1; i >= 0.0; i -= 0.02)
		{
			var f = ( 1 - 0.001/(i) )*2-1;
			vertices.push([-1.0,1.0,f],[1.0,1.0,f],[-1.0,-1.0,f], [1.0,-1.0,f]);
			vertices.push([1.0,-1.0,f],[1.0,1.0,f],[-1.0,-1.0,f],[-1.0,1.0,f]);
		}

		this.frustum_mesh = GL.Mesh.load({vertices:vertices});

		//cylinder
		this.cylinder_mesh = GL.Mesh.cylinder({radius:10,height:2});

		//axis
		vertices = [];
		var colors = [];
		dist = 2;
		vertices.push([0,0,0],[+dist*0.5,0,0]);
		colors.push([1,0,0,1],[1,0,0,1]);
		vertices.push([0,0,0],[0,+dist*0.5,0]);
		colors.push([0,1,0,1],[0,1,0,1]);
		vertices.push([0,0,0],[0,0,+dist*0.5]);
		colors.push([0,0,1,1],[0,0,1,1]);
		this.axis_mesh = GL.Mesh.load({vertices:vertices, colors: colors});

		//top
		vertices = [];
		vertices.push([0,0,0],[0,+dist*0.5,0]);
		vertices.push([0,+dist*0.5,0],[0.1*dist,+dist*0.4,0]);
		vertices.push([0,+dist*0.5,0],[-0.1*dist,+dist*0.4,0]);
		this.top_line_mesh = GL.Mesh.load({vertices:vertices});

		//front
		vertices = [];
		vertices.push([0,0,0],[0,0,+dist*0.5]);
		vertices.push([0,0,+dist*0.5],[0,0.1*dist,+dist*0.4]);
		vertices.push([0,0,+dist*0.5],[0,-0.1*dist,+dist*0.4]);
		this.front_line_mesh = GL.Mesh.load({vertices:vertices});
	},

	showTexture: function(tex)
	{
		var pos = this.textures_display.indexOf(tex);
		if(pos != -1)
			this.textures_display.splice(pos,1);
		else
			this.textures_display.push(tex);
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
				LS.Draw.renderMesh( EditorView.box_mesh, gl.LINES );
				//Draw.renderMesh( EditorView.circle_mesh, gl.TRIANGLES );
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
	else //no render instances? then render some axis
	{
		LS.Draw.push();
		var global_matrix = this.transform.getGlobalMatrix();
		if(this.transform)
			LS.Draw.multMatrix( global_matrix );
		var s = 5;
		LS.Draw.renderLines([[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]]);
		LS.Draw.pop();
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
		LS.Draw.renderImage(pos, EditorModule.icons_path + "gizmo-light.png", LS.Light.gizmo_size, true);
		gl.disable(gl.BLEND);
		if(component_selected && this.type != LS.Light.OMNI)
		{
			LS.Draw.setPointSize( 8 );
			gl.disable(gl.DEPTH_TEST);
			LS.Draw.renderPoints( target ) ;
			gl.enable(gl.DEPTH_TEST);
		}
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
		if(component_selected)
		{
			LS.Draw.setPointSize( 10 );
			gl.disable(gl.DEPTH_TEST);
			LS.Draw.renderRoundPoints( target ) ;
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
		if(this._root && this._root.transform)
			focus_dist = (far - near) * 0.5 + near;
		else
			focus_dist = vec3.length(delta);
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

	gl.depthMask( true );
}

//PRELOAD STUFF
EditorView.grid_img = new Image();
EditorView.grid_img.src = "imgs/grid.png";
EditorView.grid_img.onload = function(){ this.loaded = true; }

