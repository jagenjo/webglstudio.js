//this tool is always on, it changes the selected item when clicked
var selectTool = {
	name: "select",
	description: "Select a node",
	section: "select",
	icon: "imgs/mini-icon-cursor.png",
	keyShortcut: 81, //Q

	enabled: false,

	click_time: 200, //ms
	click_dist: 50, //in pixels (to avoid interpreting dragging as a fast click)
	click_pos: [0,0],

	onRegister: function()
	{
		RenderModule.viewport3d.addModule(this);
	},

	mousedown: function(e) {
		this.click_pos = [e.canvasx,e.canvasy];


	},

	mousemove: function(e) {

		/*		
		//test raycast
		var camera = ToolUtils.getCamera();
		var ray = camera.getRayInPixel( e.mousex, gl.canvas.height - e.mousey );
		ray.end = vec3.add( vec3.create(), ray.start, vec3.scale(vec3.create(), ray.direction, 10000) );
		var collisions = Physics.raycast(Scene, ray.start, ray.end);

		if(collisions.length)
			EditorView.debug_points.push( collisions[0][1] );
		*/
	},

	mouseup: function(e) {
		//if(!this.enabled) return;

		var now = new Date().getTime();
		var dist = Math.sqrt( (e.canvasx - this.click_pos[0])<<2 + (e.canvasy - this.click_pos[1])<<2 );
		if (e.click_time < this.click_time && dist < this.click_dist) //fast click
		{
			var instance_info = LS.Picking.getInstanceAtCanvasPosition( LS.GlobalScene, ToolUtils.getCamera(), e.canvasx,e.canvasy);

			if(e.button == 2)
				EditorModule.showContextualNodeMenu( instance_info, e );
			else if(e.shiftKey)
			{
				if( SelectionModule.isSelected( instance_info ) )
					SelectionModule.removeFromSelection( instance_info );
				else
					SelectionModule.addToSelection( instance_info );
			}
			else
				SelectionModule.setSelection( instance_info );

			//console.log("found: ", instance_info );
		}

		e.preventDefault();
		e.stopPropagation();
		return false;
	}
};

ToolsModule.registerTool({ name: "select", display: false, module: selectTool });

