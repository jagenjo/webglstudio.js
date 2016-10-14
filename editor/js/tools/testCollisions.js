var TestCollisionsTool = {
	name: "testCollisions",
	description: "To test collisions",
	section: "select",
	icon: "imgs/mini-icon-test.png",

	color: vec4.fromValues(1,0,1,1),
	mode: "colliders",
	use_mesh: false,
	all_collision: false,
	show_triangle: false,

	valid_modes: ["colliders","render_instances"],

	enabled: false,

	points: null,
	click_pos: vec2.create(),
	last_collision: null,

	onEnable: function()
	{
	},

	onClick: function()
	{
		if(this.points)
			this.points.length = 0;
	},

	inspect: function( inspector )
	{
		inspector.addCombo("Collision mode", this.mode, { values: this.valid_modes, callback: function(v){
			TestCollisionsTool.mode = v;
		}});

		inspector.addCheckbox("Use mesh", this.use_mesh, { callback: function(v){
			TestCollisionsTool.use_mesh = v;
		}});

		inspector.addCheckbox("All collisions", this.all_collision, { callback: function(v){
			TestCollisionsTool.all_collision = v;
		}});

		inspector.addCheckbox("Show triangle", this.show_triangle, { callback: function(v){
			TestCollisionsTool.show_triangle = v;
		}});

		inspector.addColor("Color", this.color, { callback: function(v){
			TestCollisionsTool.color.set(v);
		}});

		inspector.addButton(null, "Clear points", { callback: function(){
			TestCollisionsTool.points.length = 0;
		}});
	},

	mousedown: function(e) {
		this.click_pos[0] = e.canvasx;
		this.click_pos[1] = e.canvasy;
	},

	mousemove: function(e) {
		//return;
		
		//test
		if(e.dragging && e.which == GL.LEFT_MOUSE_BUTTON && !e.ctrlKey)
		{
			var camera = ToolUtils.getCamera();
			var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
			//ray.end = vec3.add( vec3.create(), ray.origin, vec3.scale(vec3.create(), ray.direction, 10000) );
			var collisions = null;
			if(this.mode == "render_instances" )
				collisions = LS.Physics.raycastRenderInstances( ray.origin, ray.direction, { triangle_collision: this.use_mesh, first_collision: !this.all_collision } );
			else
				collisions = LS.Physics.raycast( ray.origin, ray.direction ); 

			if(collisions.length)
			{
				if(!this.points)
					this.points = [];
				for(var i = 0; i < collisions.length; ++i)
				{
					this.points.push( collisions[i].position );
					if(!this.all_collision)
						break;
				}
				this.last_collision = collisions[0];
			}
			LS.GlobalScene.refresh();
			return true;
		}
	},

	mouseup: function(e) {
	},

	renderEditor: function(camera)
	{
		if(!EditorView.mustRenderGizmos()) 
			return;
		if(!RenderModule.frame_updated) 
			return;

		if(!this.points || !this.points.length)
			return;

		//now render the line
		//gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		LS.Draw.setColor( this.color );

		LS.Draw.renderPoints( this.points );

		if(this.show_triangle && this.last_collision && this.last_collision.hit && this.last_collision.hit.face )
		{
			LS.Draw.push();
			LS.Draw.multMatrix( this.last_collision.instance.matrix  );
			LS.Draw.renderLines( this.last_collision.hit.face, null, true, true );
			LS.Draw.pop();
		}

		gl.enable(gl.DEPTH_TEST);
	}
};

ToolsModule.registerTool( TestCollisionsTool );