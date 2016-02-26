var DebugModule = {
	name: "debug",
	bigicon: "imgs/tabicon-debug.png",

	enabled: false,
	mode: "textures",

	offset: vec2.create(0,0),
	scale: 1,

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab("Debug", {id:"debugtab", bigicon: this.bigicon, size: "full", callback: function(tab) {
			DebugModule.enabled = true;
			RenderModule.viewport3d.addModule( DebugModule );
			RenderModule.appendViewportTo( DebugModule.tab.content );
		},
		callback_leave: function() {
			DebugModule.enabled = false;
			RenderModule.appendViewportTo( null );
			RenderModule.viewport3d.removeModule( DebugModule );
		}});

		var content = document.getElementById("debugtab");
		content.style.padding = "0px";
		content.style.overflow = "hidden";

		var mode_tabs = new LiteGUI.Tabs("debugmodetabs", { callback: function(v) {   }});
		this.tab.add( mode_tabs );
		mode_tabs.root.style.marginTop = "4px";
		mode_tabs.root.style.backgroundColor = "#111";
		this.mode_tabs = mode_tabs;

		mode_tabs.addTab("Textures", function(){
			DebugModule.mode = "textures";
		});
		mode_tabs.addTab("Meshes",function(){
			DebugModule.mode = "meshes";
		});
		mode_tabs.addTab("Materials",function(){
			DebugModule.mode = "materials";
		});


		//enable WebGL Canvas2D renderer
		if( RenderModule.viewport3d.canvas )
			this.prepareGL();
	},

	prepareGL: function()
	{
		enableWebGLCanvas( RenderModule.viewport3d.canvas );

		this.camera = new LS.Camera();
		this.camera.lookAt([0,0,0],[0,0,-1],[0,1,0]);

		this._cubemap_shader = new GL.Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\n\
				gl_PointSize = u_point_size;\n\
				v_coord = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec2 v_coord;\n\
			uniform vec4 u_color;\n\
			uniform float u_rotation;\n\
			uniform samplerCube u_texture;\n\
			void main() {\n\
			  vec2 coord = v_coord * 2.0 - vec2(1.0);\n\
			  float dist = length(coord);\n\
			  if(dist > 1.1)\n\
			  {\n\
			  	gl_FragColor = vec4(0.0,0.0,0.0,1.0);\n\
			  	return;\n\
			  }\n\
			  if(dist > 0.99)\n\
			  	discard;\n\
			  vec3 dir = normalize(vec3( coord, 0.5 ));\n\
			  float c = cos(u_rotation);\n\
			  float s = sin(u_rotation);\n\
			  dir = vec3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);\n\
			  vec4 tex = textureCube(u_texture, dir);\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  gl_FragColor = u_color * tex;\n\
			}\
		');

		//TODO: shadowmap shader
	},

	render: function()
	{
		if(!this.enabled) 
			return;

		gl.clearColor(0.1,0.1,0.1,1.0);
		gl.clear( gl.COLOR_BUFFER_BIT );

		this.camera.setOrthographic(0, gl.canvas.width, gl.canvas.height, 0, -1, 1 );
		this.camera.updateMatrices();

		LS.Draw.push();
		LS.Draw.setCamera( this.camera );
		LS.Draw.setColor([1,1,1,1]);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);

		var ctx = gl; //nicer

		ctx.start2D(); //WebGLtoCanvas2D
		ctx.save();
		ctx.scale( this.scale, this.scale );
		ctx.translate( this.offset[0], this.offset[1] );

		ctx.fillStyle = "black";
		ctx.font = "80px Arial";
		ctx.fillText( this.mode, 0, -40 );

		if(this.mode == "textures")
			this.renderTextures();
		else if (this.mode == "meshes")
			this.renderMeshes();
		else if (this.mode == "materials")
			this.renderMaterials();

		gl.restore();
		gl.finish2D(); //WebGLtoCanvas2D
		LS.Draw.pop();
		return true;
	},

	renderTextures: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		for(var i in LS.RM.textures)
		{
			var tex = LS.RM.textures[i];
			var w = size * tex.width / tex.height;
			var h = size;


			if(tex.texture_type == gl.TEXTURE_2D)
			{
				//LS.Draw.renderPlane([posx + size*0.6, posy + size*0.6, 0], [size*0.5,-size*0.5], tex );
				gl.drawImage(tex, posx, posy, w, h );
			}
			else
			{
				this._cubemap_shader.uniforms({u_rotation: getTime() * 0.001 });
				LS.Draw.renderPlane([ gl._matrix[6] + (posx + w*0.5) * gl._matrix[0], gl._matrix[7] + (posy + h*0.5) * gl._matrix[4], 0], [ w*0.5 * gl._matrix[0], -h*0.5 * gl._matrix[4] ], tex, this._cubemap_shader );
			}

			var filename = LS.RM.getFilename(i).substr(0,24);
			var text = filename;
			gl.globalAlpha = 0.5;
			gl.strokeRect( posx, posy, w, h );
			gl.globalAlpha = 1;
			gl.fillText(text,posx + 5,posy + 15);

			posx += w + margin;

			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
	},

	renderMeshes: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";


		var mesh_camera = this._mesh_camera;
		if(!mesh_camera)
			mesh_camera = this._mesh_camera = new LS.Camera();

		var old_viewport = gl.getViewport();

		var matrix = mat4.create();
		if(this.meshes_axis == "Y")
			mat4.rotateY( matrix, matrix, getTime() * 0.0005 );
		else
			mat4.rotateZ( matrix, matrix, getTime() * 0.0005 );

		for(var i in LS.RM.meshes)
		{
			var mesh = LS.RM.meshes[i];
			var w = size;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			if(startx <= gl.canvas.width && starty <= gl.canvas.height || 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				//move camera to bounding area
				var bounding = mesh.bounding;
				var halfsize = BBox.getHalfsize( bounding );
				var center = BBox.getCenter( bounding );
				var radius = vec3.length( halfsize );
				mesh_camera.setPerspective( 45,1,0.1,radius * 4 );

				if(this.meshes_axis == "Y")
					mesh_camera.lookAt([ 0, radius * 0.5, radius * 2 ],[0,0,0],[0,1,0]);
				else
					mesh_camera.lookAt([ radius * 0.5, radius * 2, 0 ],[0,0,0],[0,0,1]);

				LS.Draw.pushCamera();
				LS.Draw.setCamera( mesh_camera );
				LS.Draw.setMatrix( matrix );
				LS.Draw.translate( -center[0], -center[1], -center[2]);

				gl.viewport( startx, starty, sizex, sizey );

				gl.disable( gl.BLEND );
				gl.enable( gl.DEPTH_TEST );
				LS.Draw.renderMesh( mesh, gl.TRIANGLES, LS.Draw.shader_phong );
				gl.enable( gl.BLEND );

				if(1) //wireframe
				{
					if(!mesh.indexBuffers["wireframe"])
						mesh.computeWireframe();
					LS.Draw.renderMesh( mesh, gl.LINES, null, "wireframe" );
				}

				gl.disable( gl.DEPTH_TEST );

				gl.setViewport( old_viewport );
				LS.Draw.popCamera();

				var filename = LS.RM.getFilename(i).substr(0,24);
				var text = filename;
				gl.globalAlpha = 0.5;
				gl.strokeRect( posx, posy, w, h );
				gl.globalAlpha = 1;
				gl.fillText(text,posx + 5,posy + 15);
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
	},

	renderMaterials: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		LS.Draw.reset_stack_on_reset = false;

		var old_viewport = gl.getViewport();

		for(var i in LS.RM.materials)
		{
			var material = LS.RM.materials[i];
			var w = size;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			if(startx <= gl.canvas.width && starty <= gl.canvas.height || 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				gl.viewport( startx, starty, sizex, sizey );

				//render
				LS.Renderer.renderMaterialPreview( material, 1, { to_viewport: true, background_color: [0.1,0.1,0.1,1.0], rotate: 0.02 } );

				gl.setViewport( old_viewport );

				gl.enable( gl.BLEND );
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

				var filename = LS.RM.getFilename(i).substr(0,24);
				var text = filename;
				gl.globalAlpha = 0.5;
				gl.strokeRect( posx, posy, w, h );
				gl.globalAlpha = 1;
				gl.fillText(text,posx + 5,posy + 15);
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
	},

	mousedown: function(e)
	{
		return true;
		/*
		if (e.which != GL.LEFT_MOUSE_BUTTON)
			return;

		var instance_info = Renderer.getInstanceAtCanvasPosition(Scene, ToolUtils.getCamera(), e.mousex, e.mousey );
		SelectionModule.setSelection( instance_info );
		if(!instance_info)
			return;

		this.mouse_pos.set([e.canvasx, e.canvasy, 0]);
		this.state = "dragging";
		return true;
		*/
	},

	mouseup: function(e)
	{
		return true;
		/*
		this.state = null;
		Scene.refresh();

		var parent = Scene.root;
		var child = SelectionModule.getSelectedNode();
		if(!child) 
			return;

		var instance_info = Renderer.getInstanceAtCanvasPosition(Scene, ToolUtils.getCamera(), e.mousex, e.mousey );
		if(instance_info)
		{
			var selection = SelectionModule.convertSelection( instance_info );
			parent = selection.node;
			if(!parent) 
				return;
		}

		if(parent == child)
			return;

		parent.addChild(child, null, true);
		return true;
		*/
	},

	mousemove: function(e)
	{
		if(e.dragging)
		{
			this.offset[0] += e.deltax / this.scale;
			this.offset[1] += e.deltay / this.scale;
		}

		return true;

		/*
		if(!this.state)
			return;

		this.mouse_pos.set([e.canvasx, e.canvasy, 0]);
		Scene.refresh();
		return true;
		*/
	},
		
	mousewheel: function(e)
	{
		if(!this.enabled)
			return;

		this.changeScale( this.scale * (e.wheel > 0 ? 1.1 : 0.9), [e.canvasx, gl.canvas.height - e.canvasy] );
		e.stopPropagation();
		return true;
	},

	convertOffsetToCanvas: function(pos)
	{
		return [pos[0] / this.scale - this.offset[0], pos[1] / this.scale - this.offset[1]];
	},

	convertCanvasToOffset: function(pos)
	{
		return [(pos[0] + this.offset[0]) * this.scale, 
			(pos[1] + this.offset[1]) * this.scale ];
	},

	changeScale: function(value, zooming_center)
	{
		zooming_center = zooming_center || [gl.canvas.width * 0.5,gl.canvas.height * 0.5];
		var center = this.convertOffsetToCanvas( zooming_center );
		this.scale = value;

		var new_center = this.convertOffsetToCanvas( zooming_center );
		var delta_offset = [new_center[0] - center[0], new_center[1] - center[1]];

		this.offset[0] += delta_offset[0];
		this.offset[1] += delta_offset[1];
	}

};


CORE.registerModule( DebugModule );